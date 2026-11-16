begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- Issue #770 changed both runtime selection and cost observability, and
-- 20261116184759 moved the platform up to gpt-6-luna and the 2.6 image models.
-- Pin the active models and ensure historical ledger rows remain priceable
-- after each switch.
select is(
  (select text_model from public.provider_config where provider = 'openai'),
  'gpt-6-luna',
  'OpenAI text generation uses gpt-6-luna'
);

select is(
  (select image_model from public.provider_config where provider = 'openai'),
  'gpt-image-2.6-flare',
  'OpenAI image generation uses flare 2.6, never gpt-image-2'
);

select is(
  (select document_model from public.provider_config where provider = 'openai'),
  'gpt-6-luna',
  'document extraction uses gpt-6-luna'
);

select is(
  (select array[chronicle_image_model, map_style_model, brush_tip_model, tile_pack_model]
     from public.provider_config where provider = 'openai'),
  array['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-sunburst'],
  'the Chronicler paints on flare 2.6; the map styler, brush tips and map tiles on sunburst 2.6'
);

select is(
  (select input_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-6-luna'),
  0.10::numeric,
  'gpt-6-luna input pricing is recorded'
);

select is(
  (select output_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-6-luna'),
  0.50::numeric,
  'gpt-6-luna output pricing is recorded'
);

select is(
  (select count(*) from public.ai_model_pricing
    where model in ('gpt-image-2.6-flare', 'gpt-image-2.6-sunburst')
      and input_cost_per_million_tokens = 5
      and image_input_cost_per_million_tokens = 8
      and image_output_cost_per_million_tokens = 30),
  2::bigint,
  'both 2.6 image models are priced at the 2.5 token rates'
);

select is(
  (select count(*) from public.ai_model_pricing
    where model in ('gpt-4o-mini', 'gpt-5.6-luna', 'gpt-image-1.5', 'gpt-image-2')),
  4::bigint,
  'pricing exists for both old and new OpenAI models'
);

select is(
  (select input_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-5.6-luna'),
  0.20::numeric,
  'historical gpt-5.6-luna input usage remains priceable'
);

select is(
  (select output_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-5.6-luna'),
  1.20::numeric,
  'historical gpt-5.6-luna output usage remains priceable'
);

select is(
  (select input_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-4o-mini'),
  0.15::numeric,
  'historical 4o-mini input usage remains priceable'
);

select is(
  (select output_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-4o-mini'),
  0.60::numeric,
  'historical 4o-mini output usage remains priceable'
);

select is(
  (select image_output_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-image-2'),
  30.00::numeric,
  'historical GPT Image 2 usage remains priceable'
);

select is(
  (select image_output_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-image-1.5'),
  32.00::numeric,
  'historical GPT Image 1.5 usage remains priceable'
);

select is(
  (select count(*) from public.ai_model_pricing
    where model in ('gpt-4o-mini', 'gpt-5.6-luna', 'gpt-image-1.5', 'gpt-image-2')
      and last_verified_at is not null),
  4::bigint,
  'all restored OpenAI pricing rows carry a verification timestamp'
);

select * from finish();
rollback;
