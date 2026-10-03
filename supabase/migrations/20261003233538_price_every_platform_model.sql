-- Migration: price_every_platform_model
-- Every model the app can call has a correct ai_model_pricing row (#962).
--
-- `ai_generation_costs` prices a ledger row by joining on `model`, so a model
-- with no row is costed as NULL and a wrong row is costed wrong, both without
-- any error. 20261003151734 priced gpt-image-2.5-sunburst after eight map
-- renders had gone uncosted; checking the rest of the table found four more
-- problems, all on paths that have not charged a credit yet (the ledger holds
-- no anthropic row), which is the only reason none of them showed:
--
--   * claude-haiku-4-5 was priced at $0.80 / $4.00, Claude 3.5 Haiku's rates.
--     Haiku 4.5 is $1 / $5 per million tokens.
--   * claude-opus-5, the Anthropic document_model and the documentGen.ts
--     default, had no row at all.
--   * provider_config.anthropic.text_model was `claude-haiku-3-20240307`. That
--     id never existed (Claude 3 Haiku is `claude-3-haiku-20240307`), and Claude
--     3 Haiku itself retired on 19 Apr 2026, so every Anthropic text call 404'd.
--     It moves to Haiku 4.5, and fast_text_model to the same alias, so the
--     model the ledger records is the one this table prices: the join is exact,
--     and the dated `claude-haiku-4-5-20251001` it held would have missed the
--     `claude-haiku-4-5` row.
--   * gpt-image-1 and gpt-image-1-mini were filed as model_type 'text'.
--   * gemini-2.5-flash, the Gemini text, fast and document model, was priced in
--     production by an admin edit that no migration records, so a replayed
--     schema had no row for it. Inserted at production's rates; production's
--     own row is left alone.
--
-- supabase/tests/model_pricing_coverage.test.sql now fails when a model the
-- edge functions name, or provider_config holds, has no row here.
--
-- Anthropic rates checked 2026-10-04 against Anthropic's model pricing table.

update public.ai_model_pricing
set input_cost_per_million_tokens  = 1.00,
    output_cost_per_million_tokens = 5.00,
    last_verified_at               = '2026-10-04T00:00:00Z',
    updated_at                     = now()
where model = 'claude-haiku-4-5';

insert into public.ai_model_pricing (
  model,
  provider,
  model_type,
  input_cost_per_million_tokens,
  output_cost_per_million_tokens,
  notes,
  last_verified_at,
  updated_at
)
values
  ('claude-haiku-4-5', 'anthropic', 'text', 1.00, 5.00, 'Anthropic text and fast model', '2026-10-04T00:00:00Z', now()),
  ('claude-opus-5', 'anthropic', 'text', 5.00, 25.00, 'Anthropic document model (reads PDFs and page photos)', '2026-10-04T00:00:00Z', now()),
  ('gemini-2.5-flash', 'gemini', 'text', 0.30, 2.50, 'Gemini text, fast and document model', '2026-05-31T22:10:39Z', now())
on conflict (model) do nothing;

update public.ai_model_pricing
set model_type = 'image',
    updated_at = now()
where model in ('gpt-image-1', 'gpt-image-1-mini');

update public.provider_config
set text_model      = 'claude-haiku-4-5',
    fast_text_model = 'claude-haiku-4-5'
where provider = 'anthropic';
