-- Migration: openai_6_and_image_2_6_models
-- Moves the platform's OpenAI models up a generation (16 Nov 2026):
--
--   text, documents          gpt-5.6-luna           -> gpt-6-luna
--   images, the Chronicler   gpt-image-2.5-flare    -> gpt-image-2.6-flare
--   map styler, brush tips   gpt-image-2.5-sunburst -> gpt-image-2.6-sunburst
--   Cartographer tile packs  image_model (flare)    -> gpt-image-2.6-sunburst
--
-- Tile packs get their own model column, like the map styler, the Chronicler and
-- brush tips: tiles come out much better on sunburst than on flare (the
-- maintainer, 16 Nov 2026), and image_model stays on flare for everything else.
-- NULL means "use image_model". Existing RLS covers the column: provider_config
-- is readable by any signed-in user and writable by the admin only.
--
-- Rates from OpenAI's model pages (developers.openai.com/api/docs/models/
-- gpt-6-luna, gpt-image-2.6-flare, gpt-image-2.6-sunburst), read 16 Nov 2026:
--
--   gpt-6-luna               $0.10 input / $0.50 output per million tokens
--                            (gpt-5.6-luna was $0.20 / $1.20). Reasoning effort
--                            defaults to medium; textGen.ts and documentGen.ts
--                            send low, as they did for 5.6.
--   gpt-image-2.6-flare      $5 text input, $8 image input, $30 image output,
--   gpt-image-2.6-sunburst   the same token rates as the 2.5 pair.
--
-- The same token rate is not the same price per image (gpt-image-2 wrote ~5x
-- flare's tokens at one rate). The 2.6 models add a `complexity` request field
-- that defaults to `high` when omitted, and nothing sends it yet, so compare
-- their cost per image in `ai_generation_costs` once they have rendered, not here.
--
-- Every model column of the openai row is set, not just the ones that change:
-- image_model and chronicle_image_model reached flare in production through the
-- admin panel, and a database built from the migrations still had image_model on
-- gpt-image-2. Production keeps fast_text_model null (it falls back to
-- text_model), so that is left alone.
--
-- The 2.5 and 5.6 pricing rows stay: they price historical ledger rows.

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
  ('gpt-6-luna',             'openai', 'text',  0.10, 0.50, null, null,  null, 'Platform text and document model; low reasoning effort', '2026-11-16T00:00:00Z', now()),
  ('gpt-image-2.6-flare',    'openai', 'image', 5.00, null, 8.00, 30.00, null, 'Platform image generation and editing model; looser, faster', '2026-11-16T00:00:00Z', now()),
  ('gpt-image-2.6-sunburst', 'openai', 'image', 5.00, null, 8.00, 30.00, null, 'Map styler, brush tips and map tiles; follows the brief more exactly than flare', '2026-11-16T00:00:00Z', now())
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

alter table public.provider_config add column tile_pack_model text;

comment on column public.provider_config.tile_pack_model is
  'Image model for Cartographer tile-pack slots (tile-pack-generator). NULL = use image_model.';

update public.provider_config
set text_model            = 'gpt-6-luna',
    document_model        = 'gpt-6-luna',
    image_model           = 'gpt-image-2.6-flare',
    chronicle_image_model = 'gpt-image-2.6-flare',
    map_style_model       = 'gpt-image-2.6-sunburst',
    brush_tip_model       = 'gpt-image-2.6-sunburst',
    tile_pack_model       = 'gpt-image-2.6-sunburst'
where provider = 'openai';
