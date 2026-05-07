-- Migration: credit_calibration_rpc
-- Adds get_credit_calibration_hints() RPC for admin credit cost calibration suggestions

create or replace function get_credit_calibration_hints()
returns table(
  generation_type      text,
  current_cost         int,
  avg_actual_usd_cents numeric,
  sample_size          bigint,
  suggested_cost       int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_samples    constant int     := 20;
  v_threshold      constant numeric := 0.20;
  v_cents_per_credit numeric;
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
    raise exception 'Admin only';
  end if;

  -- Derive cents-per-credit from the cheapest pack for the buyer
  -- (fewest credits per euro = worst deal = highest cost per credit = conservative baseline)
  -- Prefer stripe_unit_amount (authoritative); fall back to eur_display * 100.
  select
    case
      when stripe_unit_amount is not null then stripe_unit_amount::numeric / credits
      else eur_display * 100.0 / credits
    end
  into v_cents_per_credit
  from credit_pack_config
  where credits > 0 and (stripe_unit_amount is not null or eur_display > 0)
  order by
    case
      when stripe_unit_amount is not null then stripe_unit_amount::numeric / credits
      else eur_display * 100.0 / credits
    end desc  -- highest price per credit = worst deal for buyer
  limit 1;

  return query
  select
    agg.generation_type,
    cc.credit_cost::int                                         as current_cost,
    round(agg.avg_cents, 4)                                     as avg_actual_usd_cents,
    agg.sample_size,
    case
      when v_cents_per_credit is not null and agg.sample_size >= v_min_samples then
        greatest(1, round(agg.avg_cents / v_cents_per_credit))::int
      else null
    end                                                         as suggested_cost
  from (
    select
      l.reason                            as generation_type,
      avg(g.estimated_cost_usd_cents)     as avg_cents,
      count(*)                            as sample_size
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

grant execute on function get_credit_calibration_hints() to authenticated;
