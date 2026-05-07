-- Migration: credits_numeric
-- Convert credit ledger and cost columns from integer to numeric(10,2) to support provider multipliers

-- Drop both views that depend on ai_credit_ledger.delta
drop view if exists ai_generation_costs;
drop view if exists ai_credit_balance;

alter table ai_credit_ledger
  alter column delta type numeric(10,2);

alter table ai_generation_credit_costs
  alter column credit_cost type numeric(10,2);

-- Recreate balance view without ::int cast so balance can be fractional
create view ai_credit_balance
  with (security_invoker = true)
  as
  select user_id, coalesce(sum(delta), 0) as balance
  from ai_credit_ledger
  group by user_id;

-- Recreate analytics view unchanged (delta is now numeric, no cast needed)
create view ai_generation_costs
  with (security_invoker = true)
as
select
  l.id,
  l.user_id,
  l.delta,
  l.reason,
  l.model,
  l.provider,
  l.input_tokens,
  l.output_tokens,
  l.image_count,
  l.is_byok,
  l.created_at,
  case
    when p.cost_per_image_usd is not null then
      round((coalesce(l.image_count, 1) * p.cost_per_image_usd * 100)::numeric, 4)
    when p.cost_per_audio_second_usd is not null then
      null
    when p.input_cost_per_million_tokens is not null then
      round((
        coalesce(l.input_tokens,  0)::numeric / 1000000 * p.input_cost_per_million_tokens  * 100 +
        coalesce(l.output_tokens, 0)::numeric / 1000000 * p.output_cost_per_million_tokens * 100
      ), 4)
    else null
  end as estimated_cost_usd_cents
from ai_credit_ledger l
left join ai_model_pricing p on l.model = p.model;
