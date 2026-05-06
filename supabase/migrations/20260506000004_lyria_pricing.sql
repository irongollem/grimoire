-- Migration: lyria_pricing
-- Add per-model pricing rows for Lyria 3 variants used by soundboard music generation.
-- Each generation is one unit; cost_per_image_usd is reused as "cost per generation".

insert into ai_model_pricing (model, provider, input_cost_per_million_tokens, output_cost_per_million_tokens, cost_per_image_usd, cost_per_audio_second_usd, notes)
values
  ('lyria-3-clip-preview', 'google', null, null, 0.04, null, 'Lyria 3 clip (~30 s) — $0.04/generation flat'),
  ('lyria-3-pro-preview',  'google', null, null, 0.08, null, 'Lyria 3 full song (~2 min) — $0.08/generation flat')
on conflict (model) do update set
  cost_per_image_usd = excluded.cost_per_image_usd,
  notes              = excluded.notes,
  updated_at         = now();
