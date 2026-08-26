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
  'payment_fee_fixed_eur', 0.25
))
on conflict (key) do nothing;

-- Return type changes, so `create or replace` cannot be used. Grants are
-- restored below exactly as they were: authenticated + service_role, never anon.
drop function if exists public.get_credit_calibration_hints();

create function public.get_credit_calibration_hints()
returns table(
  generation_type        text,
  current_cost           int,
  -- What a render of this type actually cost, at whatever size it was made.
  avg_actual_usd_cents   numeric,
  -- The same, normalised to a 1024-square render: the only figure comparable
  -- to `credit_cost`, and what `suggested_cost` is derived from.
  avg_baseline_usd_cents numeric,
  sample_size            bigint,
  suggested_cost         int
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
  select
    agg.generation_type,
    cc.credit_cost::int  as current_cost,
    round(agg.avg_cents, 4)          as avg_actual_usd_cents,
    round(agg.avg_baseline_cents, 4) as avg_baseline_usd_cents,
    agg.sample_size,
    case
      when v_cents_per_credit is not null and agg.sample_size >= v_min_samples then
        greatest(1, round((agg.avg_baseline_cents / v_usd_per_eur) / v_cents_per_credit))::int
      else null
    end as suggested_cost
  from (
    select
      l.reason                        as generation_type,
      avg(g.estimated_cost_usd_cents) as avg_cents,
      -- Each row divided by its OWN area, so a type rendered at several sizes
      -- averages comparably instead of tracking its traffic mix.
      avg(g.estimated_cost_usd_cents / case
            when g.size ~ '^[0-9]+x[0-9]+$'
             and split_part(g.size, 'x', 1)::numeric * split_part(g.size, 'x', 2)::numeric > 0
              then (split_part(g.size, 'x', 1)::numeric * split_part(g.size, 'x', 2)::numeric)
                   / (1024.0 * 1024.0)
            else 1.0
          end)                        as avg_baseline_cents,
      count(*)                        as sample_size
    from ai_credit_ledger l
    join ai_generation_costs g on g.id = l.id
    where
      l.created_at >= now() - interval '30 days'
      and g.estimated_cost_usd_cents is not null
      and exists (
        select 1 from ai_generation_credit_costs cc2
        where cc2.generation_type = l.reason
      )
    group by l.reason
  ) agg
  join ai_generation_credit_costs cc on cc.generation_type = agg.generation_type
  order by agg.generation_type;
end;
$$;

comment on function public.get_credit_calibration_hints() is
  'Admin-only. Suggests a credit_cost from measured provider spend over 30 days. Normalises each render by its own area so the suggestion is a 1024-square BASE cost comparable to credit_cost, converts USD to EUR, and values a credit at what it nets us in the cheapest pack after VAT and processing. Economics live in app_settings.credit_calibration. See #773.';

revoke execute on function public.get_credit_calibration_hints() from public, anon;
grant execute on function public.get_credit_calibration_hints() to authenticated, service_role;
