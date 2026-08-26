-- Migration: calibration_hints_compare_like_with_like
--
-- Closes #773. `get_credit_calibration_hints()` divided a measured provider cost
-- by a revenue-per-credit figure, and neither side was the thing it claimed to
-- be. Four errors, and — this is the part that made it dangerous — every one of
-- them pointed the same way: suggest a LOWER price than cost supports.
--
--   1. SIZE. The average is of what a render actually cost, at whatever size it
--      was made. `credit_cost`, which the admin panel compares it against, is
--      the 1024-square BASE; the charge is base x sizeMultiplier(size). For
--      `entity_image` at 1024x1536 that is 1.5x, so following the hint set a
--      base with the size premium already baked in.
--   2. CURRENCY. `avg_actual_usd_cents` is USD; `v_cents_per_credit` came from
--      `credit_pack_config`, which is EUR. The division simply mixed them.
--   3. GROSS vs NET. Pack prices are VAT-inclusive and Stripe takes a cut, so a
--      EUR 20 pack is not EUR 20 of revenue. Using the sticker price overstated
--      what a credit earns by about a quarter.
--   4. THE WRONG PACK. It selected the pack with the HIGHEST cents-per-credit,
--      calling that "conservative". It is conservative for the buyer. We need
--      the opposite: a credit bought in the 2600-for-EUR-20 bulk pack earns the
--      LEAST, so that is the one a price has to clear.
--
-- Compounded, a portrait type could be recommended at roughly a third of what it
-- costs. Nothing was mispriced by it — every live price was set by hand — but a
-- number that reads authoritative and is 3x out is a trap left for later.
--
-- ── Keeping the two-sided warning honest ────────────────────────────────────
--
-- The panel already warns both ways — red up-arrow when a price is too low, blue
-- down-arrow when the margin is steep, green tick when it is right — and that is
-- the point of the tool: keep pricing fun and fair rather than merely solvent.
-- What it lacked was a fair reference point. `suggested_cost` was BREAK-EVEN, so
-- "well calibrated" meant "priced at cost" and every healthy margin was flagged
-- as steep. Following the panel would have taken entity_image from a 2.09x
-- margin to exactly zero.
--
-- So break-even and the suggestion are now separate. `breakeven_cost` is the
-- floor: below it we lose money on every call. `suggested_cost` is that floor
-- times `target_margin` — the price we actually think is fair. The panel warns
-- against the suggestion in both directions, and calls out dropping below the
-- floor as its own, louder case.
--
-- ── Cost per CHARGE, not per call ───────────────────────────────────────────
--
-- Averaging the cost of ledger rows answers the wrong question wherever one
-- payment buys more than one provider call. A tile-pack slot is bought once and
-- may generate four times; averaging rows divides our spend by four and reports
-- a tile costing 1.4 credits when the slot costs 5.5. The panel would then have
-- called 12 credits a 4x overcharge and invited us to cut it to 3 — below cost.
--
-- Total spend divided by the number of times we CHARGED is the unit the price
-- actually has to cover, and it needs no per-feature special case: a free retry
-- contributes to spend (delta 0, is_byok false — which is why recordFreeGeneration
-- exists) and not to the count. BYOK rows are excluded from both: the user paid
-- that provider bill, so it is neither our cost nor our revenue.
--
-- ── The economics are configuration, not constants ──────────────────────────
--
-- FX moves, VAT depends on registration, and Stripe's rate is negotiable. They
-- live in `app_settings` under `credit_calibration` so an operator can correct
-- them without a migration, with the defaults below as the 26 Aug 2026 position.
-- Read through `coalesce` so a missing or partial row degrades to those defaults
-- rather than to NULL, which would silently suppress every suggestion.
--
-- ── A caveat about history ──────────────────────────────────────────────────
--
-- Rows written before 20260826215438 have no `size`, and are treated as 1.0.
-- That is wrong for the old 1024x1536 portraits — it understates their baseline
-- cost and suggests a price 1.5x high. High is the safe direction, and the RPC's
-- window is 30 days, so it ages out on its own.

insert into public.app_settings (key, value)
values ('credit_calibration', jsonb_build_object(
  'usd_per_eur',           1.08,
  'vat_rate',              0.21,
  'payment_fee_rate',      0.015,
  'payment_fee_fixed_eur', 0.25,
  -- The margin a price is measured against, not a floor. 2.0 is where
  -- entity_image already sits, so it describes existing practice rather than
  -- imposing a new one.
  'target_margin',         2.0
))
on conflict (key) do nothing;

-- Return type changes, so `create or replace` cannot be used. Grants are
-- restored below exactly as they were: authenticated + service_role, never anon.
drop function if exists public.get_credit_calibration_hints();

create function public.get_credit_calibration_hints()
returns table(
  generation_type        text,
  current_cost           int,
  -- What one render of this type actually cost, at whatever size it was made.
  avg_actual_usd_cents   numeric,
  -- Total spend per time we charged, normalised to a 1024-square render. This is
  -- the unit `credit_cost` has to cover, and it differs from the average above
  -- wherever one payment buys several calls.
  cost_per_charge_usd_cents numeric,
  -- Credits that exactly cover that. The floor: below it we lose money.
  breakeven_cost         int,
  -- The floor times `target_margin` — the price we think is fair.
  suggested_cost         int,
  -- Times we charged, not rows recorded.
  sample_size            bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_samples      constant int := 20;
  v_config           jsonb;
  v_usd_per_eur      numeric;
  v_vat_rate         numeric;
  v_fee_rate         numeric;
  v_fee_fixed        numeric;
  v_target_margin    numeric;
  v_cents_per_credit numeric;
begin
  if not private.is_app_admin() then
    raise exception 'Admin only';
  end if;

  select value into v_config from app_settings where key = 'credit_calibration';
  v_usd_per_eur := coalesce((v_config ->> 'usd_per_eur')::numeric, 1.08);
  v_vat_rate    := coalesce((v_config ->> 'vat_rate')::numeric, 0.21);
  v_fee_rate    := coalesce((v_config ->> 'payment_fee_rate')::numeric, 0.015);
  v_fee_fixed   := coalesce((v_config ->> 'payment_fee_fixed_eur')::numeric, 0.25);
  v_target_margin := greatest(1.0, coalesce((v_config ->> 'target_margin')::numeric, 2.0));

  -- Net EUR cents a credit earns us, from the pack where it earns least. VAT is
  -- remitted and the processor's cut never arrives, so neither is revenue.
  select min(
    ((gross / (1 + v_vat_rate)) - (gross * v_fee_rate + v_fee_fixed)) * 100.0 / credits
  )
  into v_cents_per_credit
  from (
    select credits,
           case when stripe_unit_amount is not null then stripe_unit_amount::numeric / 100.0
                else eur_display end as gross
      from credit_pack_config
     where credits > 0 and (stripe_unit_amount is not null or eur_display > 0)
  ) packs
  where gross > 0;

  if v_cents_per_credit is not null and v_cents_per_credit <= 0 then
    v_cents_per_credit := null;
  end if;

  return query
  with priced as (
    select
      l.reason,
      l.is_byok,
      l.delta,
      g.estimated_cost_usd_cents as cents,
      -- Each row against its OWN area, so a type rendered at several sizes
      -- normalises comparably instead of tracking its traffic mix.
      g.estimated_cost_usd_cents / case
        when g.size ~ '^[0-9]+x[0-9]+$'
         and split_part(g.size, 'x', 1)::numeric * split_part(g.size, 'x', 2)::numeric > 0
          then (split_part(g.size, 'x', 1)::numeric * split_part(g.size, 'x', 2)::numeric)
               / (1024.0 * 1024.0)
        else 1.0
      end as baseline_cents
    from ai_credit_ledger l
    join ai_generation_costs g on g.id = l.id
    where
      l.created_at >= now() - interval '30 days'
      and g.estimated_cost_usd_cents is not null
      and exists (select 1 from ai_generation_credit_costs cc2 where cc2.generation_type = l.reason)
  ),
  agg as (
    select
      reason as generation_type,
      avg(cents) filter (where not is_byok)                       as avg_cents,
      sum(baseline_cents) filter (where not is_byok)              as spend_cents,
      count(*) filter (where not is_byok and delta < 0)           as charges
    from priced
    group by reason
  ),
  derived as (
    select
      agg.*,
      case when agg.charges > 0 then agg.spend_cents / agg.charges end as per_charge,
      case when agg.charges > 0 and v_cents_per_credit is not null
           then (agg.spend_cents / agg.charges / v_usd_per_eur) / v_cents_per_credit
      end as breakeven_raw
    from agg
  )
  select
    d.generation_type,
    cc.credit_cost::int             as current_cost,
    round(d.avg_cents, 4)           as avg_actual_usd_cents,
    round(d.per_charge, 4)          as cost_per_charge_usd_cents,
    case when d.breakeven_raw is not null and d.charges >= v_min_samples
         then greatest(1, round(d.breakeven_raw))::int end as breakeven_cost,
    case when d.breakeven_raw is not null and d.charges >= v_min_samples
         then greatest(1, round(d.breakeven_raw * v_target_margin))::int end as suggested_cost,
    d.charges                       as sample_size
  from derived d
  join ai_generation_credit_costs cc on cc.generation_type = d.generation_type
  order by d.generation_type;
end;
$$;

comment on function public.get_credit_calibration_hints() is
  'Admin-only. From 30 days of measured spend: `breakeven_cost` is the credit price that exactly covers provider cost, `suggested_cost` is that times target_margin. Spend is divided by the number of times we CHARGED, not by rows, so a free retry counts as cost and not as a sale; BYOK is excluded from both. Each render is normalised by its own area, so both figures are 1024-square BASE costs comparable to credit_cost. Economics live in app_settings.credit_calibration. See #773.';

revoke execute on function public.get_credit_calibration_hints() from public, anon;
grant execute on function public.get_credit_calibration_hints() to authenticated, service_role;
