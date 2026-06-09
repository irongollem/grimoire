-- Migration: ai_generation_costs_exclude_credit_grants
-- The ai_generation_costs view surfaced every ai_credit_ledger row, including
-- credit additions (admin_grant, purchases, refunds, monthly refreshes). Those
-- have no model/provider, so the AI Usage Stats panel rendered them as
-- "(UNKNOWN)" generations. A generation always deducts credits (delta < 0) or
-- is free (delta = 0, BYOK); credit additions are the only rows with delta > 0.
-- Filter them out so the view contains generations only.

create or replace view ai_generation_costs as
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
