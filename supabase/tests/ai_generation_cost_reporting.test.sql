begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- Cover for 20260826215438. Both properties exist because every credit price is
-- meant to be set from measured spend, and `get_credit_calibration_hints` reads
-- this view back to recommend one — so a wrong number here does not fail, it
-- quietly votes.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'costs@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.ai_credit_ledger
  (id, user_id, delta, reason, model, provider, quality, size,
   input_tokens, input_image_tokens, output_tokens, image_count)
values
  -- One model, two variants. The rates are per-token, so the tier changes the
  -- token count and not the price of a token — but the row must still say which.
  ('91000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001',
   -12, 'tile_pack_generation', 'gpt-image-2', 'openai', 'low', '1024x1024', 262, 250, 196, 1),
  ('91000000-0000-4000-8000-00000000000b', '91000000-0000-4000-8000-000000000001',
   -75, 'entity_image', 'gpt-image-2', 'openai', 'high', '1024x1536', 706, 2988, 7024, 1),
  -- The provider returned no usage metadata. `openaiUsage` defaults these to 0,
  -- and the view's branch fires on IS NOT NULL — 0 is not null — so this used to
  -- price as a confident $0.0000 for a call that cost us money.
  ('91000000-0000-4000-8000-00000000000c', '91000000-0000-4000-8000-000000000001',
   -12, 'tile_pack_generation', 'gpt-image-2', 'openai', 'low', '1024x1024', 0, 0, 0, 1);

select is(
  (select quality from public.ai_generation_costs where id = '91000000-0000-4000-8000-00000000000a'),
  'low',
  'a render records which variant of its model ran');

select is(
  (select size from public.ai_generation_costs where id = '91000000-0000-4000-8000-00000000000b'),
  '1024x1536',
  'and at what size, since output tokens scale with area');

-- 0.131c text + 0.200c image-in + 0.588c image-out = 0.9190c ($0.0092)
select is(
  (select estimated_cost_usd_cents from public.ai_generation_costs where id = '91000000-0000-4000-8000-00000000000a'),
  0.9190::numeric,
  'a low-quality tile prices from its own token counts');

-- 0.353c + 2.390c + 21.072c = 23.8154c ($0.238) — 26x the tile above,
-- from the same ai_model_pricing row, purely on token counts.
select is(
  (select estimated_cost_usd_cents from public.ai_generation_costs where id = '91000000-0000-4000-8000-00000000000b'),
  23.8154::numeric,
  'a high-quality render 25x more expensive prices correctly off the same model row');

select ok(
  (select estimated_cost_usd_cents from public.ai_generation_costs where id = '91000000-0000-4000-8000-00000000000c') is null,
  'a render whose provider reported no usage is unknown, not free');

-- The consequence that matters: an unknown cost must abstain from calibration
-- rather than drag the suggested price toward zero.
select is(
  (select count(*)::int from public.ai_generation_costs
    where reason = 'tile_pack_generation' and estimated_cost_usd_cents is not null),
  1,
  'only rows with real usage reach the calibration average');

select * from finish();
rollback;
