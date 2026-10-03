-- Migration: price_gpt_image_2_5_sunburst
-- Prices gpt-image-2.5-sunburst, which the map styler has rendered on since
-- 27 Sep 2026 (MAP_STYLE_OPENAI_MODEL) without a pricing row.
--
-- `ai_generation_costs` computes estimated_cost_usd_cents by joining the ledger
-- to this table on model, so a model with no row is costed as NULL: the eight
-- styler renders before this migration showed no provider cost in the admin
-- cost views, though their credits were charged normally. The view reads the
-- row at query time, so adding it prices those eight retroactively.
--
-- Found during #955 (library item art), which also renders on sunburst.
-- Source checked 2026-10-03:
--   https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
-- Same per-token rates as gpt-image-2.5-flare: $5 text input, $8 image input,
-- $30 image output per million tokens (standard, not batch).
insert into public.ai_model_pricing (
  model,
  provider,
  model_type,
  input_cost_per_million_tokens,
  output_cost_per_million_tokens,
  image_input_cost_per_million_tokens,
  image_output_cost_per_million_tokens,
  cost_per_image_usd,
  notes,
  last_verified_at,
  updated_at
)
values
  ('gpt-image-2.5-sunburst', 'openai', 'image', 5.00, null, 8.00, 30.00, null, 'Map styler model; stronger and slower than flare at the same token rates', '2026-10-03T00:00:00Z', now())
on conflict (model) do update set
  provider = excluded.provider,
  model_type = excluded.model_type,
  input_cost_per_million_tokens = excluded.input_cost_per_million_tokens,
  output_cost_per_million_tokens = excluded.output_cost_per_million_tokens,
  image_input_cost_per_million_tokens = excluded.image_input_cost_per_million_tokens,
  image_output_cost_per_million_tokens = excluded.image_output_cost_per_million_tokens,
  cost_per_image_usd = excluded.cost_per_image_usd,
  notes = excluded.notes,
  last_verified_at = excluded.last_verified_at,
  updated_at = excluded.updated_at;
