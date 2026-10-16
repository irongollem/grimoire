-- #1073 story 3: a map's darkness level (dungeon_maps.darkness, 20261016222755_dungeon_map_darkness) is one of the rules'
-- three, starts in daylight, and a change to it makes a published site stale like a change to the drawing does.

begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('10730000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1073-darkness@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.dungeon_maps (id, user_id, name)
values ('10730000-0000-4000-8000-000000000310', '10730000-0000-4000-8000-000000000301', 'Black lake');

select is(
  (select darkness from public.dungeon_maps where id = '10730000-0000-4000-8000-000000000310'),
  'daylight',
  'a new map starts in daylight');

select throws_ok(
  $$update public.dungeon_maps set darkness = 'twilight' where id = '10730000-0000-4000-8000-000000000310'$$,
  '23514',
  null,
  'only daylight, dim and dark are levels');

create temp table rev_before as select rev from public.dungeon_maps where id = '10730000-0000-4000-8000-000000000310';

update public.dungeon_maps set darkness = 'dark' where id = '10730000-0000-4000-8000-000000000310';
select is(
  (select rev from public.dungeon_maps where id = '10730000-0000-4000-8000-000000000310'),
  (select rev + 1 from rev_before),
  'darkening a map bumps its rev, so its published site reads as out of date');

update public.dungeon_maps set darkness = 'dark' where id = '10730000-0000-4000-8000-000000000310';
select is(
  (select rev from public.dungeon_maps where id = '10730000-0000-4000-8000-000000000310'),
  (select rev + 1 from rev_before),
  'saving the same level again does not');

update public.dungeon_maps set name = 'The black lake' where id = '10730000-0000-4000-8000-000000000310';
select is(
  (select rev from public.dungeon_maps where id = '10730000-0000-4000-8000-000000000310'),
  (select rev + 1 from rev_before),
  'and a rename still leaves the rev alone');

select * from finish();
rollback;
