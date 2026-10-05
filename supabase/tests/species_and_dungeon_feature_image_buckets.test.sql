-- #978: species-images (each user's folder, plus an admin-only srd/ prefix) and
-- dungeon-feature-images (each user's folder only), from migration
-- 20261005144201_species_and_dungeon_feature_image_buckets.
--
--   1 Ada (app admin)   2 Ben (ordinary user)   3 Cal (ordinary user)

begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97810000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'species-feature-images-' || n || '@example.invalid', '',
       case when n = 1 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 3) as n;

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"97810000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"97810000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

select is((select count(*)::int from storage.buckets where id in ('species-images', 'dungeon-feature-images') and public), 2,
  'both buckets exist and are public');

set local role authenticated;

-- species-images
select pg_temp.as_user(2);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('species-images', '97810000-0000-4000-8000-000000000002/zzgrim.webp', '97810000-0000-4000-8000-000000000002') $$,
  'a user writes their own species-images folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('species-images', '97810000-0000-4000-8000-000000000003/zzgrim.webp') $$,
  '42501', null, 'a user cannot write another user''s species-images folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('species-images', 'srd/zzgrim.webp') $$,
  '42501', null, 'a non-admin cannot write under species-images/srd/');
select pg_temp.as_user(1, true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('species-images', 'srd/zzgrim.webp') $$,
  'the admin can write under species-images/srd/');

-- storage.protect_delete refuses every direct DELETE unless this is set; with it
-- set for the transaction, the policies are what decide.
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.as_user(2);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'species-images' and name = 'srd/zzgrim.webp' returning name $$,
  'a non-admin cannot delete canonical species art');

-- dungeon-feature-images
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('dungeon-feature-images', '97810000-0000-4000-8000-000000000002/zzgrim.webp', '97810000-0000-4000-8000-000000000002') $$,
  'a user writes their own dungeon-feature-images folder');
-- Owner set to the writer: the baseline's owner-keyed policy let this through.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('dungeon-feature-images', '97810000-0000-4000-8000-000000000003/zzgrim.webp', '97810000-0000-4000-8000-000000000002') $$,
  '42501', null, 'a user cannot write another user''s dungeon-feature-images folder, whoever the owner column names');
select pg_temp.as_user(1, true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('dungeon-feature-images', 'srd/zzgrim.webp') $$,
  '42501', null, 'dungeon-feature-images has no srd/ prefix, not even for the admin');
select pg_temp.as_user(2);
select isnt_empty(
  $$ delete from storage.objects
     where bucket_id = 'dungeon-feature-images' and name = '97810000-0000-4000-8000-000000000002/zzgrim.webp' returning name $$,
  'a user deletes their own dungeon feature art');

select * from finish();
rollback;
