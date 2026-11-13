-- Brush tips described in words (#1181): the Illuminator's New brush can ask the image model for a sheet of four
-- single brush marks from a description, black on white, which the client cuts into four tips. One call is one
-- picture, so it costs what a picture costs (50, like `entity_image` and `illuminate_picture`), under its own type
-- so the ledger names it.
--
-- The marks have to come out as drawn (one dab each, clean edges on white), which is the stronger model's work, so
-- brush tips get their own image model setting beside the others in Admin, Providers, starting on sunburst; NULL
-- means "use image_model". A surface's model is a setting, never a code constant (20261004230642). Existing RLS
-- covers the column: provider_config is readable by any signed-in user and writable by the admin only.

alter table public.provider_config add column brush_tip_model text;

comment on column public.provider_config.brush_tip_model is
  'Image model for brush tips described in words (paint-brush-tips). NULL = use image_model.';

update public.provider_config set brush_tip_model = 'gpt-image-2.5-sunburst' where provider = 'openai';

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('paint_brush_tips', 'Brush tips (AI)', 50, 50)
on conflict (generation_type) do nothing;
