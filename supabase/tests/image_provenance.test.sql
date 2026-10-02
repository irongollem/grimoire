-- #935: the per-image provenance registry.
--
-- Direct reads are own-rows-only (the registry cannot be listed); everyone else
-- looks an image up by exact key through get_image_provenance(). Writes are
-- confined to the caller's own folder. Each refusal below sits
-- beside a positive control, so a policy that refuses everything cannot pass.
--
--   1 owner of folder 1   2 another signed-in user   (admin path is not
--   exercised: private.is_app_admin() is covered by admin_authorization_guards)

begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93500000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'image-prov-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

-- ── User 1 registers under their own folder ─────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"93500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000001/abc', '93500000-0000-4000-8000-000000000001',
      '{"generatorType":"npc","provider":"openai","model":"m","generatedAt":"2026-08-04T12:00:00.000Z","edited":false}') $$,
  'a user can register provenance under their own folder');

select is(
  (select count(*)::int from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/abc'),
  1, 'the owner reads the row back');

-- A second row for the delete positive control.
insert into public.image_provenance (bucket, stem, user_id, provenance) values
  ('npc-portraits', '93500000-0000-4000-8000-000000000001/gone', '93500000-0000-4000-8000-000000000001',
   '{"generatorType":"npc","provider":"openai","model":"m","generatedAt":"2026-08-04T12:00:00.000Z","edited":false}');

select throws_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000001/bad', '93500000-0000-4000-8000-000000000001', '[]') $$,
  '23514', null, 'a provenance that is not an object is rejected');

select throws_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000001/bad', '93500000-0000-4000-8000-000000000001', '{"provider":"x"}') $$,
  '23514', null, 'a provenance without generatedAt is rejected');

select throws_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('monster-images', 'srd/owlbear', '93500000-0000-4000-8000-000000000001',
      '{"provider":"x","generatedAt":"2026-08-04T12:00:00.000Z"}') $$,
  '42501', null, 'a non-admin cannot register under the canonical srd/ folder');

-- ── User 2 reads, but cannot write into user 1's folder ─────────────────────
select set_config('request.jwt.claims',
  '{"sub":"93500000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.image_provenance),
  0, 'another signed-in user cannot list the registry');

select is(
  (select provenance ->> 'provider' from public.get_image_provenance(
     array['npc-portraits'], array['93500000-0000-4000-8000-000000000001/abc'])),
  'openai', 'another signed-in user gets the record by exact key');

select is(
  (select count(*)::int from public.get_image_provenance(
     array['npc-portraits'], array['93500000-0000-4000-8000-000000000001/nope'])),
  0, 'a wrong stem returns nothing');

select is(
  (select count(*)::int from public.get_image_provenance(
     array['monster-images'], array['93500000-0000-4000-8000-000000000001/abc'])),
  0, 'the bucket is part of the key');

select throws_ok(
  $$ select * from public.get_image_provenance(array['npc-portraits','sounds'], array['x']) $$,
  '22023', null, 'mismatched array lengths raise');

select throws_ok(
  $$ select * from public.get_image_provenance(
       array_fill('npc-portraits'::text, array[201]), array_fill('x'::text, array[201])) $$,
  '22023', null, '201 keys raise');

select lives_ok(
  $$ select * from public.get_image_provenance(
       array_fill('npc-portraits'::text, array[200]), array_fill('x'::text, array[200])) $$,
  '200 keys are accepted');

select ok(
  pg_get_function_result('public.get_image_provenance(text[], text[])'::regprocedure) not like '%user_id%',
  'the function returns no user_id column');

select throws_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000001/abc', '93500000-0000-4000-8000-000000000002',
      '{"provider":"x","generatedAt":"2026-08-04T12:00:00.000Z"}')
     on conflict (bucket, stem) do update set provenance = excluded.provenance $$,
  '42501', null, 'an upsert onto a key owned by another user is refused');

select throws_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000001/forged', '93500000-0000-4000-8000-000000000002',
      '{"provider":"x","generatedAt":"2026-08-04T12:00:00.000Z"}') $$,
  '42501', null, 'a user cannot register under another user''s folder');

select throws_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000001/forged', '93500000-0000-4000-8000-000000000001',
      '{"provider":"x","generatedAt":"2026-08-04T12:00:00.000Z"}') $$,
  '42501', null, 'a user cannot register a row in another user''s name');

-- User 2's own row: the positive control for the re-pointing refusals.
select lives_ok(
  $$ insert into public.image_provenance (bucket, stem, user_id, provenance) values
     ('npc-portraits', '93500000-0000-4000-8000-000000000002/mine', '93500000-0000-4000-8000-000000000002',
      '{"provider":"x","generatedAt":"2026-08-04T12:00:00.000Z"}') $$,
  'a user can register under their own folder (second user)');

select lives_ok(
  $$ update public.image_provenance set provenance = provenance || '{"edited":true}'
       where stem = '93500000-0000-4000-8000-000000000002/mine' $$,
  'a user can update their own row');

select throws_ok(
  $$ update public.image_provenance set stem = '93500000-0000-4000-8000-000000000001/moved'
       where stem = '93500000-0000-4000-8000-000000000002/mine' $$,
  '42501', null, 'an own row cannot be re-pointed into another folder');

select throws_ok(
  $$ update public.image_provenance set user_id = '93500000-0000-4000-8000-000000000001'
       where stem = '93500000-0000-4000-8000-000000000002/mine' $$,
  '42501', null, 'an own row cannot be handed to another user_id');

update public.image_provenance set provenance = provenance || '{"edited":true}'
  where stem = '93500000-0000-4000-8000-000000000001/abc';
delete from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/gone';

reset role;
select is(
  (select (provenance ->> 'edited')::boolean from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/abc'),
  false, 'another user''s update left the row unchanged');
select is(
  (select count(*)::int from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/gone'),
  1, 'another user''s delete left the row in place');

-- ── Positive controls: the owner can update and delete ──────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"93500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

update public.image_provenance set provenance = provenance || '{"edited":true}'
  where stem = '93500000-0000-4000-8000-000000000001/abc';
delete from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/gone';

reset role;
select is(
  (select (provenance ->> 'edited')::boolean from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/abc'),
  true, 'the owner can update their row');
select is(
  (select count(*)::int from public.image_provenance where stem = '93500000-0000-4000-8000-000000000001/gone'),
  0, 'the owner can delete their row');

-- ── A caller with no session is refused by the function ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select * from public.get_image_provenance(array['npc-portraits'], array['x']) $$,
  '42501', 'Not signed in', 'get_image_provenance refuses a caller with no session');
reset role;

-- ── anon cannot read ────────────────────────────────────────────────────────
set local role anon;
select throws_ok(
  $$ select count(*) from public.image_provenance $$,
  '42501', null, 'anon cannot read the registry');
reset role;

select * from finish();
rollback;
