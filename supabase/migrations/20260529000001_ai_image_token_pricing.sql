-- Migration: ai_image_token_pricing
-- Populate real token-based pricing for OpenAI image models and guard the cost
-- view's token branch so rows with no logged tokens fall back to the flat
-- per-image estimate instead of computing $0.

-- ── 1. Real OpenAI image token rates (USD per 1M tokens) ──────────────────────
-- input_cost_per_million_tokens        = text-input rate
-- image_input_cost_per_million_tokens  = image-input rate (seed images on edits)
-- image_output_cost_per_million_tokens = generated-image rate (dominant cost)
-- cost_per_image_usd is kept as a fallback for legacy rows that predate token logging.
update ai_model_pricing
  set input_cost_per_million_tokens        = 5,
      image_input_cost_per_million_tokens  = 8,
      image_output_cost_per_million_tokens = 32
  where model = 'gpt-image-1.5';

update ai_model_pricing
  set input_cost_per_million_tokens        = 5,
      image_input_cost_per_million_tokens  = 8,
      image_output_cost_per_million_tokens = 30
  where model = 'gpt-image-2';

update ai_model_pricing
  set input_cost_per_million_tokens        = 2,
      image_input_cost_per_million_tokens  = 2.5,
      image_output_cost_per_million_tokens = 8
  where model = 'gpt-image-1-mini';

-- ── 2. Cost view — guard the image-token branch ──────────────────────────────
-- Only use token-based image costing when the row actually has logged tokens;
-- otherwise fall through to the flat per-image estimate. Without this guard,
-- pre-token-logging image rows (null tokens) would compute as $0.00.
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
         and (l.input_tokens is not null or l.input_image_tokens is not null or l.output_tokens is not null) then
      round(
        coalesce(l.input_tokens,       0)::numeric / 1000000 * coalesce(p.input_cost_per_million_tokens,       0) * 100 +
        coalesce(l.input_image_tokens, 0)::numeric / 1000000 * coalesce(p.image_input_cost_per_million_tokens, 0) * 100 +
        coalesce(l.output_tokens,      0)::numeric / 1000000 * p.image_output_cost_per_million_tokens               * 100,
      4)
    when p.cost_per_image_usd is not null then
      round((coalesce(l.image_count, 1) * p.cost_per_image_usd * 100)::numeric, 4)
    when p.input_cost_per_million_tokens is not null then
      round((
        coalesce(l.input_tokens,  0)::numeric / 1000000 * p.input_cost_per_million_tokens                  * 100 +
        coalesce(l.output_tokens, 0)::numeric / 1000000 * coalesce(p.output_cost_per_million_tokens, 0)    * 100
      ), 4)
    else null
  end as estimated_cost_usd_cents
from ai_credit_ledger l
left join ai_model_pricing p on l.model = p.model;
