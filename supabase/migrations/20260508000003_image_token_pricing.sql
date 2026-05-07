-- Migration: image_token_pricing
-- Proper per-token pricing for image models + audio column on provider_config + view rewrite

-- ── 1. ai_model_pricing: add image token cost columns ───────────────────────

alter table ai_model_pricing
  add column image_input_cost_per_million_tokens  numeric(10,4),
  add column image_output_cost_per_million_tokens numeric(10,4);

-- Seed token pricing for OpenAI image models (source: OpenAI pricing page)
-- gpt-image-1.5: text-in $5/M, text-out $10/M, img-in $8/M, img-out $32/M
update ai_model_pricing set
  input_cost_per_million_tokens         = 5.0,
  output_cost_per_million_tokens        = 10.0,
  image_input_cost_per_million_tokens   = 8.0,
  image_output_cost_per_million_tokens  = 32.0,
  cost_per_image_usd                    = null
where model = 'gpt-image-1.5';

-- gpt-image-2: text-in $5/M, no text-out, img-in $8/M, img-out $30/M
update ai_model_pricing set
  input_cost_per_million_tokens         = 5.0,
  output_cost_per_million_tokens        = null,
  image_input_cost_per_million_tokens   = 8.0,
  image_output_cost_per_million_tokens  = 30.0,
  cost_per_image_usd                    = null
where model = 'gpt-image-2';

-- gpt-image-1-mini: text-in $2/M, no text-out, img-in $2.5/M, img-out $8/M
update ai_model_pricing set
  input_cost_per_million_tokens         = 2.0,
  output_cost_per_million_tokens        = null,
  image_input_cost_per_million_tokens   = 2.5,
  image_output_cost_per_million_tokens  = 8.0,
  cost_per_image_usd                    = null
where model = 'gpt-image-1-mini';

-- gpt-image-1 was the old placeholder with flat estimate — keep flat for now,
-- model should not be in active use given we're on 1.5/2
-- (admin can clear cost_per_image_usd and add token pricing once confirmed)

-- fal.ai and Lyria keep cost_per_image_usd (genuinely flat per-generation)

-- ── 2. ai_credit_ledger: add input_image_tokens column ──────────────────────

alter table ai_credit_ledger
  add column input_image_tokens bigint;

-- ── 3. provider_config: add audio modality columns ──────────────────────────

alter table provider_config
  add column audio_model      text,
  add column audio_enabled    boolean not null default false,
  add column audio_multiplier numeric(4,2);

-- Seed Lyria as Google's audio model
update provider_config
  set audio_model = 'lyria-3-clip-preview', audio_multiplier = 1.0
  where provider = 'gemini';

-- ── 4. Rewrite ai_generation_costs view with full token pricing priority ─────
-- Drop required: CREATE OR REPLACE can't add columns when existing column order changes.

drop view if exists ai_generation_costs;

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
  l.input_image_tokens,
  l.output_tokens,
  l.image_count,
  l.is_byok,
  l.created_at,
  case
    -- Image token-based pricing (gpt-image-1.5, gpt-image-2, gpt-image-1-mini)
    -- Discriminated by image_output_cost_per_million_tokens being set.
    -- input_tokens = text prompt tokens; input_image_tokens = reference image tokens
    when p.image_output_cost_per_million_tokens is not null then
      round((
        coalesce(l.input_tokens,       0)::numeric / 1000000 * coalesce(p.input_cost_per_million_tokens,       0) * 100 +
        coalesce(l.input_image_tokens, 0)::numeric / 1000000 * coalesce(p.image_input_cost_per_million_tokens, 0) * 100 +
        coalesce(l.output_tokens,      0)::numeric / 1000000 * p.image_output_cost_per_million_tokens           * 100
      ), 4)
    -- Flat per-generation (fal.ai image, Lyria audio)
    when p.cost_per_image_usd is not null then
      round((coalesce(l.image_count, 1) * p.cost_per_image_usd * 100)::numeric, 4)
    -- Text token-based pricing
    when p.input_cost_per_million_tokens is not null then
      round((
        coalesce(l.input_tokens,  0)::numeric / 1000000 * p.input_cost_per_million_tokens  * 100 +
        coalesce(l.output_tokens, 0)::numeric / 1000000 * coalesce(p.output_cost_per_million_tokens, 0) * 100
      ), 4)
    else null
  end as estimated_cost_usd_cents
from ai_credit_ledger l
left join ai_model_pricing p on l.model = p.model;
