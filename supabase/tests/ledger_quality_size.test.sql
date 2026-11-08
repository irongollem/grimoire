begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- Cover for 20261108220525. `spend_credits` and `settle_ai_generation_job`
-- were the only writers of a charged ledger row, and both dropped the render's
-- quality and size, so no charged row ever had them and cost reports could not
-- tell a high render from a low one or a portrait from a styled map.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('93100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ledger-variant@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- 100 purchased credits only: the whole spend lands in one row.
insert into public.ai_credit_ledger (user_id, delta, reason, bucket)
values ('93100000-0000-4000-8000-000000000001', 100, 'admin_grant', 'purchased');

select public.spend_credits('93100000-0000-4000-8000-000000000001', 'map_style_generation', 62,
  '{"model":"gpt-image-2.5-sunburst","provider":"openai","quality":"high","size":"2560x1440","output_tokens":3000}'::jsonb);

select results_eq(
  $$select quality, size from public.ai_credit_ledger
     where user_id = '93100000-0000-4000-8000-000000000001' and reason = 'map_style_generation'$$,
  $$values ('high'::text, '2560x1440'::text)$$,
  'a charged render records the quality and size it was rendered at'
);

-- A split spend: 10 subscription credits, the rest purchased. The usage goes on
-- the subscription row once; the purchased row carries none, so a report that
-- sums usage counts the render once.
insert into public.ai_credit_ledger (user_id, delta, reason, bucket)
values ('93100000-0000-4000-8000-000000000001', 10, 'subscription_grant', 'subscription');

select public.spend_credits('93100000-0000-4000-8000-000000000001', 'entity_image', 27,
  '{"model":"gpt-image-2.5-flare","provider":"openai","quality":"medium","size":"1024x1536"}'::jsonb);

select results_eq(
  $$select quality, size from public.ai_credit_ledger
     where user_id = '93100000-0000-4000-8000-000000000001' and reason = 'entity_image' and bucket = 'subscription'$$,
  $$values ('medium'::text, '1024x1536'::text)$$,
  'a split spend records quality and size on the row that carries the usage'
);

select results_eq(
  $$select quality, size from public.ai_credit_ledger
     where user_id = '93100000-0000-4000-8000-000000000001' and reason = 'entity_image' and bucket = 'purchased'$$,
  $$values (null::text, null::text)$$,
  'the purchased half of a split spend carries no usage, so nothing is counted twice'
);

-- A settled BYOK job writes its own zero-delta row from the job's billing log.
insert into public.campaigns (id, user_id, name)
values ('93100000-0000-4000-8000-0000000000c1', '93100000-0000-4000-8000-000000000001', 'Ledger variant');

insert into public.ai_generation_jobs (id, user_id, campaign_id, generator_type, status, artifact_url, billing_context)
values ('93100000-0000-4000-8000-0000000000a1', '93100000-0000-4000-8000-000000000001',
        '93100000-0000-4000-8000-0000000000c1', 'entity_image', 'settling', 'https://example.invalid/a.webp',
        '{"is_byok": true, "generation_type": "entity_image",
          "log": {"model": "gpt-image-2.5-flare", "provider": "openai", "quality": "low", "size": "1024x1024"}}'::jsonb);

select public.settle_ai_generation_job('93100000-0000-4000-8000-0000000000a1', '{}'::jsonb);

select results_eq(
  $$select quality, size from public.ai_credit_ledger
     where user_id = '93100000-0000-4000-8000-000000000001' and is_byok$$,
  $$values ('low'::text, '1024x1024'::text)$$,
  'a settled BYOK render records the quality and size it was rendered at'
);

select * from finish();
rollback;
