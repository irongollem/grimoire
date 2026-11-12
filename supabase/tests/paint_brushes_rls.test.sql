-- A painter's own brushes (#1181, migration 20261112200154) are theirs alone. Each assertion names the bug it
-- fails on.

begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('11810000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'brush-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11810000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'brush-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-0000000000b1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.paint_brushes (id, name, preset, source)
     values ('11810000-0000-4000-8000-0000000000c1', 'Salt wash', '{"v":1}', 'abr') $$,
  'a painter saves a brush without naming themselves (fails if user_id has no auth.uid() default or the grant is missing)'
);
select is(
  (select user_id from public.paint_brushes where id = '11810000-0000-4000-8000-0000000000c1'),
  '11810000-0000-4000-8000-0000000000b1'::uuid,
  'the brush is filed under its painter'
);
select throws_ok(
  $$ insert into public.paint_brushes (user_id, name, preset, source)
     values ('11810000-0000-4000-8000-0000000000b2', 'Planted', '{"v":1}', 'made') $$,
  '42501', null,
  'a painter cannot file a brush under another account (fails if the insert policy stops checking user_id)'
);
select throws_ok(
  $$ insert into public.paint_brushes (name, preset, source) values ('Odd', '{"v":1}', 'stolen') $$,
  '23514', null,
  'a brush says where it came from, from a fixed list (fails if the source check is dropped)'
);

set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-0000000000b2","role":"authenticated"}';

select is_empty(
  $$ select 1 from public.paint_brushes where id = '11810000-0000-4000-8000-0000000000c1' $$,
  'another painter cannot see the brush (fails if the select policy widens)'
);
update public.paint_brushes set name = 'Mine now' where id = '11810000-0000-4000-8000-0000000000c1';
delete from public.paint_brushes where id = '11810000-0000-4000-8000-0000000000c1';

set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-0000000000b1","role":"authenticated"}';

select is(
  (select name from public.paint_brushes where id = '11810000-0000-4000-8000-0000000000c1'), 'Salt wash',
  'another painter can neither rename nor delete it (fails if the update or delete policy widens)'
);
select throws_ok(
  $$ update public.paint_brushes set user_id = '11810000-0000-4000-8000-0000000000b2'
      where id = '11810000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'the owner cannot hand a brush to another account (the update check and the select policy both refuse it; fails only if both widen)'
);

reset role;
delete from auth.users where id = '11810000-0000-4000-8000-0000000000b1';
select is_empty(
  $$ select 1 from public.paint_brushes where user_id = '11810000-0000-4000-8000-0000000000b1' $$,
  'erasing an account takes its brushes with it (fails if the foreign key does not cascade)'
);

select * from finish();
rollback;
