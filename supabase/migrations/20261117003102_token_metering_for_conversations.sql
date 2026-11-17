-- Metering a conversation by the tokens it used (#1205).
--
-- A fixed price per call cannot work for a table the AI runs: one message from the player is several model calls of
-- very different size, and a session is hundreds of them. So a conversation is charged from measured tokens: the
-- provider's price for them, times the margin the admin already set for calibrating fixed prices, divided by what
-- a credit is worth to us. The server accrues that exactly on the session and bills only the whole credits the
-- running total newly crosses, because the house rule is never to bill a fraction of a credit and rounding each
-- turn up would overcharge by about half.
--
-- Three things here.
--
-- 1. `ai_model_pricing.cached_input_cost_per_million_tokens`. Providers bill input served from their prompt cache
--    at a lower rate, and a long conversation is mostly that. Null means "no cached rate on file", and the
--    metering then prices cached input at the full input rate: a missing number must never make play cheaper.
--
-- 2. `private.credit_calibration()`: what a credit is worth, in one place. `get_credit_calibration_hints` worked it
--    out inline (the net euro cents a credit earns from the pack where it earns least, after VAT and the payment
--    processor's cut). The metering needs the same figure, and two copies of it would drift the first time a pack
--    price or a fee changes. The hints function is recreated below to read it from here; its body is otherwise the
--    applied definition, its guard, signature and grants unchanged.
--
-- 3. `public.agent_credit_calibration()`: the two numbers the turn function needs, for the service role only. It
--    is not a definer function and holds no secret, but nothing a browser does needs it.

alter table public.ai_model_pricing
  add column cached_input_cost_per_million_tokens numeric;

comment on column public.ai_model_pricing.cached_input_cost_per_million_tokens is
  'USD per million input tokens served from the provider''s prompt cache. Null: not on file, priced at the full input rate.';

create or replace function private.credit_calibration()
returns table (usd_per_eur numeric, target_margin numeric, cents_per_credit numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_config    jsonb;
  v_vat_rate  numeric;
  v_fee_rate  numeric;
  v_fee_fixed numeric;
begin
  select s.value into v_config from public.app_settings s where s.key = 'credit_calibration';
  usd_per_eur   := coalesce((v_config ->> 'usd_per_eur')::numeric, 1.08);
  v_vat_rate    := coalesce((v_config ->> 'vat_rate')::numeric, 0.21);
  v_fee_rate    := coalesce((v_config ->> 'payment_fee_rate')::numeric, 0.015);
  v_fee_fixed   := coalesce((v_config ->> 'payment_fee_fixed_eur')::numeric, 0.25);
  target_margin := greatest(1.0, coalesce((v_config ->> 'target_margin')::numeric, 2.0));

  -- Net EUR cents a credit earns us, from the pack where it earns least. VAT is
  -- remitted and the processor's cut never arrives, so neither is revenue.
  select min(
    ((gross / (1 + v_vat_rate)) - (gross * v_fee_rate + v_fee_fixed)) * 100.0 / credits
  )
  into cents_per_credit
  from (
    select p.credits,
           case when p.stripe_unit_amount is not null then p.stripe_unit_amount::numeric / 100.0
                else p.eur_display end as gross
      from public.credit_pack_config p
     where p.credits > 0 and (p.stripe_unit_amount is not null or p.eur_display > 0)
  ) packs
  where gross > 0;

  if cents_per_credit is not null and cents_per_credit <= 0 then
    cents_per_credit := null;
  end if;

  return next;
end;
$$;

-- Reached only through the two functions below (one runs as its owner, the other is for the service role).
revoke execute on function private.credit_calibration() from public, anon, authenticated;
grant execute on function private.credit_calibration() to service_role;

CREATE OR REPLACE FUNCTION public.get_credit_calibration_hints()
 RETURNS TABLE(generation_type text, current_cost integer, avg_actual_usd_cents numeric, cost_per_charge_usd_cents numeric, breakeven_cost integer, suggested_cost integer, sample_size bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_min_samples      constant int := 20;
  v_usd_per_eur      numeric;
  v_target_margin    numeric;
  v_cents_per_credit numeric;
begin
  if not private.is_app_admin() then
    raise exception 'Admin only';
  end if;

  -- One derivation of what a credit is worth, shared with the conversation metering (`private.credit_calibration`).
  select c.usd_per_eur, c.target_margin, c.cents_per_credit
    into v_usd_per_eur, v_target_margin, v_cents_per_credit
    from private.credit_calibration() c;

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
$function$;

-- What the turn function needs: what a credit is worth in USD, and the multiple of provider cost to charge.
-- `usd_per_credit` is null when no pack is priced, and the caller refuses to meter rather than charge nothing.
create or replace function public.agent_credit_calibration()
returns table (usd_per_credit numeric, margin numeric)
language sql
stable
set search_path = ''
as $$
  select c.cents_per_credit / 100.0 * c.usd_per_eur, c.target_margin
  from private.credit_calibration() c;
$$;

revoke execute on function public.agent_credit_calibration() from public, anon, authenticated;
grant execute on function public.agent_credit_calibration() to service_role;
