begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('public', 'user_tile_packs', 'custom pack registry exists');
select has_table('public', 'campaign_tile_packs', 'campaign sharing join exists');
select has_table('public', 'tile_pack_generation_runs', 'durable generation runs exist');
select has_table('public', 'tile_pack_generation_jobs', 'durable per-slot jobs exist');
select is((select public from storage.buckets where id = 'tile-packs'), false, 'tile-packs storage is private');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tile_packs_authenticated_insert'), 0, 'legacy broad insert policy is removed');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tile_packs_authenticated_update'), 0, 'legacy broad update policy is removed');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tile_packs_authenticated_delete'), 0, 'legacy broad delete policy is removed');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pack-pro@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('84000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pack-free@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('84000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pack-member@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('84000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pack-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

update public.user_subscriptions
set plan_id = 'pro', status = 'active'
where user_id = '84000000-0000-4000-8000-000000000001';

insert into public.campaigns (id, user_id, name)
values ('84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000001', 'Pack sharing test');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000003', 'player', 'Member');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.user_tile_packs (user_id, pack_id, name, schema_version, manifest, source)
     values ('84000000-0000-4000-8000-000000000002', 'custom-free-pack', 'Free pack', 2, '{}'::jsonb, 'upload') $$,
  'new row violates row-level security policy for table "user_tile_packs"',
  'a non-Pro cannot register a custom pack directly'
);

select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.user_tile_packs (id, user_id, pack_id, name, schema_version, manifest, source, status)
values (
  '84000000-0000-4000-8000-000000000020',
  '84000000-0000-4000-8000-000000000001',
  'custom-pro-pack', 'Pro pack', 2,
  '{"pack_id":"custom-pro-pack","pack_version":1,"schema_version":2,"base_tile_size":128,"assets":{}}'::jsonb,
  'upload', 'ready'
);
select is((select count(*)::int from public.user_tile_packs where id = '84000000-0000-4000-8000-000000000020'), 1, 'a Pro can register an owned pack');

insert into public.campaign_tile_packs (campaign_id, tile_pack_id, user_id)
values ('84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000020', '84000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.user_tile_packs where id = '84000000-0000-4000-8000-000000000020'), 1, 'campaign member can read a shared pack');

select set_config('request.jwt.claims', '{"sub":"84000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.user_tile_packs where id = '84000000-0000-4000-8000-000000000020'), 0, 'an outsider cannot read a shared pack');

reset role;
select is(
  has_function_privilege('anon', 'private.can_read_tile_pack(uuid,text,integer)', 'execute'),
  false,
  'anonymous callers cannot execute the private storage predicate'
);

select * from finish();
rollback;
