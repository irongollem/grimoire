-- Migration: enable_gemini_image
-- Enable Google's gemini-3.1-flash-image ("Nano Banana 2") as a selectable
-- campaign image provider, with confirmed list pricing.

update provider_config
  set image_model = 'gemini-3.1-flash-image',
      image_enabled = true,
      image_multiplier = 1.0,   -- credit parity with OpenAI for now; tune later
      updated_at = now()
  where provider = 'gemini';

insert into ai_model_pricing (
  model, provider, model_type,
  input_cost_per_million_tokens, output_cost_per_million_tokens,
  image_input_cost_per_million_tokens, image_output_cost_per_million_tokens,
  cost_per_image_usd, notes
) values (
  'gemini-3.1-flash-image', 'gemini', 'image',
  0.50, 3.00,
  0.50, 60.00,
  0.067, 'Nano Banana 2 — Gemini image generation (~1,120 output tokens / 1K image)'
)
on conflict (model) do update set
  provider = excluded.provider,
  model_type = excluded.model_type,
  input_cost_per_million_tokens = excluded.input_cost_per_million_tokens,
  output_cost_per_million_tokens = excluded.output_cost_per_million_tokens,
  image_input_cost_per_million_tokens = excluded.image_input_cost_per_million_tokens,
  image_output_cost_per_million_tokens = excluded.image_output_cost_per_million_tokens,
  cost_per_image_usd = excluded.cost_per_image_usd,
  notes = excluded.notes,
  updated_at = now();
