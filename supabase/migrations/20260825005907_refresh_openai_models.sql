-- Refresh the platform OpenAI defaults after access to the 5.6 line and
-- gpt-image-2 was enabled. Keep document_model independent: the importer has
-- its own measured Luna configuration from 20260825000600.
update public.provider_config
set
  text_model = 'gpt-5.6-luna',
  image_model = 'gpt-image-2'
where provider = 'openai';

-- 20260508000004 deliberately cleared the speculative pricing seed. Restore
-- verified pricing for both sides of this migration so the cost dashboard can
-- price historical 4o-mini/image-1.5 ledger rows as well as new generations.
-- Sources checked 2026-08-25:
--   https://developers.openai.com/api/docs/models/gpt-5.6-luna
--   https://developers.openai.com/api/docs/models/gpt-image-2
--   https://openai.com/api/pricing/
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
  ('gpt-4o-mini',   'openai', 'text',  0.15, 0.60, null, null, null, 'Previous platform text model; retained to price historical ledger rows', '2026-08-25T00:00:00Z', now()),
  ('gpt-5.6-luna',  'openai', 'text',  0.20, 1.20, null, null, null, 'Platform text model; low reasoning effort', '2026-08-25T00:00:00Z', now()),
  ('gpt-image-1.5', 'openai', 'image', 5.00, 10.00, 8.00, 32.00, null, 'Previous platform image model; retained to price historical ledger rows', '2026-08-25T00:00:00Z', now()),
  ('gpt-image-2',   'openai', 'image', 5.00, null, 8.00, 30.00, null, 'Platform image generation and editing model', '2026-08-25T00:00:00Z', now())
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
