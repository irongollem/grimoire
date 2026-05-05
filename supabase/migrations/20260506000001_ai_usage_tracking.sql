-- Migration: ai_usage_tracking
-- Adds per-generation token/cost telemetry to ai_credit_ledger and a model pricing reference table

-- ── 1. Extend ai_credit_ledger with usage columns ────────────────────────────

alter table ai_credit_ledger
  add column if not exists model          text,
  add column if not exists provider       text,
  add column if not exists input_tokens   int,
  add column if not exists output_tokens  int,
  add column if not exists image_count    int,
  add column if not exists is_byok        boolean not null default false;

-- ── 2. Model pricing reference table ─────────────────────────────────────────
-- Stores cost per model so we can estimate API spend without a code deploy.
-- All costs are in USD. Update rows directly when providers change pricing.

create table if not exists ai_model_pricing (
  model                          text primary key,
  provider                       text not null,
  -- Text models: cost per 1 million tokens (null for image/audio models)
  input_cost_per_million_tokens  numeric,
  output_cost_per_million_tokens numeric,
  -- Image models: flat cost per image in USD (null for text models)
  cost_per_image_usd             numeric,
  -- Audio models: cost per second of output audio (null for text/image models)
  cost_per_audio_second_usd      numeric,
  notes                          text,
  updated_at                     timestamptz default now()
);

-- Seed known models. Prices in USD as of May 2026 — update as needed.
insert into ai_model_pricing (model, provider, input_cost_per_million_tokens, output_cost_per_million_tokens, cost_per_image_usd, cost_per_audio_second_usd, notes) values
  -- OpenAI text
  ('gpt-4o-mini',         'openai',    0.150,  0.600,  null,   null,   'Fast, cheap text model — primary for all entity generation'),
  ('gpt-4o',              'openai',    2.500,  10.000, null,   null,   'High-quality text, used for complex generation'),
  -- OpenAI image (token-based pricing; approximate USD/image at standard quality)
  ('gpt-image-1',         'openai',    null,   null,   0.04,   null,   'Low quality, 1024×1024'),
  ('gpt-image-1.5',       'openai',    null,   null,   0.07,   null,   'Standard quality'),
  ('gpt-image-2',         'openai',    null,   null,   0.19,   null,   'High quality, 1024×1536'),
  ('gpt-image-1-mini',    'openai',    null,   null,   0.02,   null,   'Mini, low quality'),
  -- Anthropic
  ('claude-haiku-4-5',    'anthropic', 0.800,  4.000,  null,   null,   'Fast Anthropic model'),
  ('claude-sonnet-4-6',   'anthropic', 3.000,  15.000, null,   null,   'Standard Anthropic model'),
  -- Google Gemini text
  ('gemini-3.1-flash',    'google',    0.075,  0.300,  null,   null,   'Fast Gemini model — text generation'),
  ('gemini-3.1-pro',      'google',    1.250,  5.000,  null,   null,   'High-quality Gemini model'),
  -- Google Lyria audio
  ('lyria-3',             'google',    null,   null,   null,   null,   'Soundboard audio generation — pricing TBD'),
  -- fal.ai image
  ('fal-ai/flux-2/flex',  'falai',     null,   null,   0.003,  null,   'Per-megapixel pricing; approximate at portrait size')
on conflict (model) do nothing;

-- ── 3. Cost estimate view ─────────────────────────────────────────────────────
-- Joins ledger rows with model pricing to produce an estimated USD cost per row.
-- Use this view for analytics / pricing calibration — not for billing users.

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
  l.output_tokens,
  l.image_count,
  l.is_byok,
  l.created_at,
  -- Estimated API cost in USD cents (null when pricing data is unavailable)
  case
    when p.cost_per_image_usd is not null then
      round((coalesce(l.image_count, 1) * p.cost_per_image_usd * 100)::numeric, 4)
    when p.cost_per_audio_second_usd is not null then
      null  -- audio_seconds column not yet tracked; placeholder
    when p.input_cost_per_million_tokens is not null then
      round((
        coalesce(l.input_tokens,  0)::numeric / 1000000 * p.input_cost_per_million_tokens  * 100 +
        coalesce(l.output_tokens, 0)::numeric / 1000000 * p.output_cost_per_million_tokens * 100
      ), 4)
    else null
  end as estimated_cost_usd_cents
from ai_credit_ledger l
left join ai_model_pricing p on l.model = p.model;
