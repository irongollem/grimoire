begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- Issue #770 changes both runtime selection and cost observability. Pin the
-- active models, keep document extraction on its independently-measured model,
-- and ensure historical ledger rows remain priceable after the switch.
select is(
  (select text_model from public.provider_config where provider = 'openai'),
  'gpt-5.6-luna',
  'OpenAI text generation uses Luna'
);

select is(
  (select image_model from public.provider_config where provider = 'openai'),
  'gpt-image-2',
  'OpenAI image generation uses GPT Image 2'
);

select is(
  (select document_model from public.provider_config where provider = 'openai'),
  'gpt-5.6-luna',
  'the independently measured document model remains Luna'
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
  'Luna input pricing is recorded'
);

select is(
  (select output_cost_per_million_tokens from public.ai_model_pricing where model = 'gpt-5.6-luna'),
  1.20::numeric,
  'Luna output pricing is recorded'
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
  'GPT Image 2 output pricing is recorded'
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
