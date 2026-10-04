-- Migration: price_gpt_image_2_5_flare
-- Puts gpt-image-2.5-flare's pricing row in the migrations.
--
-- Flare has been the platform image model (provider_config.openai.image_model)
-- since September, but its pricing row was added through the admin pricing
-- panel and never reached a migration. Production has it; a database built from
-- the migrations (CI, a local reset) did not. That stayed invisible until
-- 5 Oct 2026, when the Chronicler stopped taking its model from the browser
-- (which had kept it on gpt-image-2) and the image fallbacks moved to flare, so
-- the edge functions now name flare and model_pricing_coverage.test.sql
-- requires its row.
--
-- Values copied from the production row, unchanged: the same per-token rates as
-- gpt-image-2 and gpt-image-2.5-sunburst ($5 text input, $8 image input, $30
-- image output per million tokens). The same rate is not the same price: at high
-- quality flare writes ~1,400 output tokens per image where gpt-image-2 wrote
-- ~6,700, so a flare render costs about a quarter (production ledger, 60 days to
-- 5 Oct 2026: gpt-image-2 Chronicler renders averaged 22.9 cents). `on conflict
-- do update` rewrites production with the values it already holds.
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
  ('gpt-image-2.5-flare', 'openai', 'image', 5.00, null, 8.00, 30.00, null, 'Platform image generation and editing model', '2026-09-13T20:20:38.019Z', now())
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
