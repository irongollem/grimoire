-- #978: backgrounds get the background-images bucket, with each user's own
-- folder and an admin-only srd/ prefix for canonical art (migration
-- 20261005142210_background_images_bucket).
--
--   1 Ada (app admin)   2 Ben (ordinary user)   3 Cal (ordinary user)

begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97800000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'bg-images-' || n || '@example.invalid', '',
       case when n = 1 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 3) as n;

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"97800000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"97800000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

select ok(exists (select 1 from storage.buckets where id = 'background-images' and public),
  'the background-images bucket exists and is public');

set local role authenticated;

-- A user's own folder.
select pg_temp.as_user(2);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('background-images', '97800000-0000-4000-8000-000000000002/zzgrim-own.webp', '97800000-0000-4000-8000-000000000002') $$,
  'a user writes their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('background-images', '97800000-0000-4000-8000-000000000003/zzgrim.webp') $$,
  '42501', null, 'a user cannot write another user''s folder');

-- Canonical art.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('background-images', 'srd/zzgrim-bg.webp') $$,
  '42501', null, 'a non-admin cannot write under background-images/srd/');
select pg_temp.as_user(1, true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('background-images', 'srd/zzgrim-bg.webp') $$,
  'the admin can write under background-images/srd/');

select pg_temp.as_user(2);
select is_empty(
  $$ update storage.objects set name = 'srd/zzgrim-bg2.webp'
     where bucket_id = 'background-images' and name = 'srd/zzgrim-bg.webp' returning name $$,
  'a non-admin cannot rename canonical art');

-- storage.protect_delete refuses every direct DELETE unless this is set; with it
-- set for the transaction, the policies are what decide.
select set_config('storage.allow_delete_query', 'true', true);
select is_empty(
  $$ delete from storage.objects
     where bucket_id = 'background-images' and name = 'srd/zzgrim-bg.webp' returning name $$,
  'a non-admin cannot delete canonical art');
select isnt_empty(
  $$ delete from storage.objects
     where bucket_id = 'background-images' and name = '97800000-0000-4000-8000-000000000002/zzgrim-own.webp' returning name $$,
  'a user deletes their own file');
select pg_temp.as_user(1, true);
select isnt_empty(
  $$ delete from storage.objects
     where bucket_id = 'background-images' and name = 'srd/zzgrim-bg.webp' returning name $$,
  'the admin can delete canonical art');

select * from finish();
rollback;
