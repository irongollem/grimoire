-- Migration: ai_generation_costs_security_invoker
-- The ai_generation_costs view was originally created with security_invoker = true
-- (migration 20260506000001) so the underlying ai_credit_ledger RLS applies to the
-- querying user. A later `create or replace view` (20260607000002) omitted the WITH
-- clause, which resets the view's reloptions and reverted it to SECURITY DEFINER
-- behaviour — flagged by the Supabase advisor. Re-apply the same view body with
-- security_invoker restored so each user only sees their own ledger rows.

create or replace view ai_generation_costs
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
    l.input_image_tokens,
    l.output_tokens,
    l.image_count,
    l.is_byok,
    l.created_at,
    case
      when p.image_output_cost_per_million_tokens is not null
           and (l.input_tokens is not null or l.input_image_tokens is not null or l.output_tokens is not null)
        then round(
          coalesce(l.input_tokens, 0)::numeric       / 1000000 * coalesce(p.input_cost_per_million_tokens, 0)       * 100
          + coalesce(l.input_image_tokens, 0)::numeric / 1000000 * coalesce(p.image_input_cost_per_million_tokens, 0) * 100
          + coalesce(l.output_tokens, 0)::numeric      / 1000000 * p.image_output_cost_per_million_tokens             * 100,
          4)
      when p.cost_per_image_usd is not null
        then round(coalesce(l.image_count, 1)::numeric * p.cost_per_image_usd * 100, 4)
      when p.input_cost_per_million_tokens is not null
        then round(
          coalesce(l.input_tokens, 0)::numeric  / 1000000 * p.input_cost_per_million_tokens          * 100
          + coalesce(l.output_tokens, 0)::numeric / 1000000 * coalesce(p.output_cost_per_million_tokens, 0) * 100,
          4)
      else null::numeric
    end as estimated_cost_usd_cents
  from ai_credit_ledger l
  left join ai_model_pricing p on l.model = p.model
  where l.delta <= 0;
