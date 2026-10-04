-- Migration: provider_config_purpose_image_models
-- Two image surfaces get their own model setting in Admin → Providers, beside
-- the general `image_model`. NULL means "use image_model".
--
--   map_style_model        the AI map styler (style-map). A restyle has to keep
--                          the drawn walls where they are, and flare treated the
--                          input as a loose sketch (27 Sep 2026: bigger
--                          buildings, invented rooms, a title banner), so the
--                          styler renders on the stronger sunburst. That choice
--                          was a constant in mapStylePrompt.ts; an admin could
--                          not see or change it.
--   chronicle_image_model  Chronicler scenes and group portraits
--                          (generate-chronicle-image, purposes chronicler and
--                          group_portrait). They compose from character
--                          portraits as references, so likeness may want a
--                          different model than entity art does. Starts on
--                          flare, the platform model, by the maintainer's call.
--
-- Until 5 Oct 2026 the Chronicler took its model from the browser, which sent
-- gpt-image-2 by default, so it never followed this table at all. A per-surface
-- column is the way to give a surface its own model: never a code constant,
-- never a request field.
--
-- Existing RLS covers the columns: provider_config is readable by any signed-in
-- user and writable by the admin only. Both models are priced
-- (20261003151734 sunburst, 20261004225900 flare), and
-- model_pricing_coverage.test.sql now checks these columns too.

alter table public.provider_config
  add column map_style_model text,
  add column chronicle_image_model text;

comment on column public.provider_config.map_style_model is
  'Image model for the AI map styler (style-map). NULL = use image_model.';
comment on column public.provider_config.chronicle_image_model is
  'Image model for Chronicler scenes and group portraits. NULL = use image_model.';

update public.provider_config
set map_style_model = 'gpt-image-2.5-sunburst',
    chronicle_image_model = 'gpt-image-2.5-flare'
where provider = 'openai';
