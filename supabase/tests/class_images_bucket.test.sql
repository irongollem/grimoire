-- Classes get the class-images bucket, with each user's own folder and an
-- admin-only srd/ prefix for canonical art (migration
-- 20261011190104_class_art_and_library_focal_review).
--
--   1 Ada (app admin)   2 Ben (ordinary user)   3 Cal (ordinary user)

begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('10310000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'class-images-' || n || '@example.invalid', '',
       case when n = 1 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 3) as n;

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"10310000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"10310000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

select ok(exists (select 1 from storage.buckets where id = 'class-images' and public),
  'the class-images bucket exists and is public');

set local role authenticated;

-- A user's own folder.
select pg_temp.as_user(2);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('class-images', '10310000-0000-4000-8000-000000000002/zzgrim-own.webp', '10310000-0000-4000-8000-000000000002') $$,
  'a user writes their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('class-images', '10310000-0000-4000-8000-000000000003/zzgrim.webp') $$,
  '42501', null, 'a user cannot write another user''s folder');

-- Canonical art.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('class-images', 'srd/zzgrim-class.webp') $$,
  '42501', null, 'a non-admin cannot write under class-images/srd/');
select pg_temp.as_user(1, true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('class-images', 'srd/zzgrim-class.webp') $$,
  'the admin can write under class-images/srd/');

select pg_temp.as_user(2);
select is_empty(
  $$ update storage.objects set name = 'srd/zzgrim-class2.webp'
     where bucket_id = 'class-images' and name = 'srd/zzgrim-class.webp' returning name $$,
  'a non-admin cannot rename canonical art');

-- storage.protect_delete refuses every direct DELETE unless this is set; with it
-- set for the transaction, the policies are what decide.
select set_config('storage.allow_delete_query', 'true', true);
select is_empty(
  $$ delete from storage.objects
     where bucket_id = 'class-images' and name = 'srd/zzgrim-class.webp' returning name $$,
  'a non-admin cannot delete canonical art');
select isnt_empty(
  $$ delete from storage.objects
     where bucket_id = 'class-images' and name = '10310000-0000-4000-8000-000000000002/zzgrim-own.webp' returning name $$,
  'a user deletes their own file');
select pg_temp.as_user(1, true);
select isnt_empty(
  $$ delete from storage.objects
     where bucket_id = 'class-images' and name = 'srd/zzgrim-class.webp' returning name $$,
  'the admin can delete canonical art');

select * from finish();
rollback;
