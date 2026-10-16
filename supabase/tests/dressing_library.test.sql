-- #1062: the Dressing library (library_dressing), its source and its book-icon
-- function, from migrations 20261014102253_dressing_library and
-- 20261014102255_dressing_library_content, plus #1065's flat props, groups and
-- set books (20261015224350_dressing_flat_and_set_books, 20261015231216_dressing_sewers_content,
-- 20261016000843_dressing_dungeons_book, 20261016002526_dressing_homes_and_forests_books,
-- 20261016133920_dressing_volcanoes_book, 20261016135253_dressing_palaces_book,
-- 20261016141230_dressing_deserts_book, 20261016195838_dressing_glaciers_book,
-- 20261016195839_dressing_depths_book, 20261016195840_dressing_lights,
-- 20261016201720_dressing_temples_book).
--
--   1 Ada (app admin)   2 Ben (ordinary DM)
--
-- Library rows are read by everyone and written by admins only; the catalog is
-- seeded; a footprint stays within 1..4 cells; the dressing book is listed with
-- its count and title; a new map starts with an empty dressing layer.

begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('10620000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'dressing-library-' || n || '@example.invalid', '',
       case when n = 1 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 2) as n;

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"10620000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"10620000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

set local role authenticated;

-- ── reads ───────────────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select is((select count(*)::int from public.library_dressing where source = 'grimoire-dressing'), 62,
  'an ordinary user reads the whole seeded catalog of 62 props');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-sewers'),
  row(22, 16, 4)::text,
  'the Sewers book seeds 22 props, 16 lying flat and 4 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-dungeons'),
  row(16, 10, 3)::text,
  'the Dungeons book seeds 16 props, 10 lying flat and 3 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-homes'),
  row(14, 0, 1)::text,
  'the Homes book seeds 14 props, 0 lying flat and 1 crossing');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-forests'),
  row(18, 4, 3)::text,
  'the Forests book seeds 18 props, 4 lying flat and 3 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-volcanoes'),
  row(29, 13, 4)::text,
  'the Volcanoes book seeds 29 props, 13 lying flat and 4 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-palaces'),
  row(26, 8, 2)::text,
  'the Palaces book seeds 26 props, 8 lying flat and 2 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-deserts'),
  row(29, 8, 3)::text,
  'the Deserts book seeds 29 props, 8 lying flat and 3 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-glaciers'),
  row(20, 9, 3)::text,
  'the Glaciers book seeds 20 props, 9 lying flat and 3 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'))::text
     from public.library_dressing where source = 'grimoire-dressing-depths'),
  row(22, 12, 3)::text,
  'the Depths book seeds 22 props, 12 lying flat and 3 crossings');
select is(
  (select row(count(*), count(*) filter (where flat), count(*) filter (where group_key = 'crossings'), count(light))::text
     from public.library_dressing where source = 'grimoire-dressing-temples'),
  row(19, 6, 3, 6)::text,
  'the Temples book seeds 19 props, 6 lying flat, 3 crossings and 6 that give light');
select is(
  (select row(footprint_w, footprint_h, group_key)::text from public.library_dressing where id = 'dressing_wagon'),
  row(2, 3, 'camp')::text,
  'a seeded prop carries its footprint and group');
select is(
  (select light::text from public.library_dressing where id = 'dressing_campfire'),
  '{"dim": 20, "color": "#ff8424", "bright": 20}',
  'a campfire gives light as a torch does: 20 feet bright, 20 more dim');

-- ── writes ──────────────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key) values ('zz1062_probe', 'Probe', 'furniture') $$,
  '42501', null, 'an ordinary user cannot insert a prop');
with u as (update public.library_dressing set name = 'Hacked' where id = 'dressing_chair' returning 1)
select is((select count(*)::int from u), 0, 'an ordinary user updates no prop');
with d as (delete from public.library_dressing where id = 'dressing_chair' returning 1)
select is((select count(*)::int from d), 0, 'an ordinary user deletes no prop');

select pg_temp.as_user(1, true);
select lives_ok(
  $$ insert into public.library_dressing (id, name, group_key, footprint_w, footprint_h)
     values ('zz1062_probe', 'Probe', 'furniture', 4, 4) $$,
  'the admin inserts a prop');
with u as (update public.library_dressing set tags = '{probe}' where id = 'zz1062_probe' returning 1)
select is((select count(*)::int from u), 1, 'the admin updates a prop');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, footprint_w) values ('zz1062_wide', 'Too wide', 'furniture', 5) $$,
  '23514', null, 'a footprint wider than four cells is refused');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, footprint_h) values ('zz1062_flat', 'No depth', 'furniture', 0) $$,
  '23514', null, 'a footprint under one cell is refused');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key) values ('zz1062_group', 'Odd', 'kitchenware') $$,
  '23514', null, 'a group outside the catalog''s groups is refused');
select lives_ok(
  $$ insert into public.library_dressing (id, name, group_key, light)
     values ('zz_light_ok', 'Lamp', 'camp', '{"color": "#ffb957", "bright": 30, "dim": 30, "intensity": 0.5}') $$,
  'a light with a colour, bright and dim feet and an intensity is accepted');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, light) values ('zz_light_norange', 'Lamp', 'camp', '{"color": "#ffb957", "bright": 20}') $$,
  '23514', null, 'a light without its dim feet is refused (a missing key fails, never passes as NULL)');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, light) values ('zz_light_colour', 'Lamp', 'camp', '{"color": "orange", "bright": 20, "dim": 20}') $$,
  '23514', null, 'a light whose colour is not #rrggbb is refused');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, light) values ('zz_light_far', 'Lamp', 'camp', '{"color": "#ffb957", "bright": 90, "dim": 20}') $$,
  '23514', null, 'a light past sixty feet of bright light is refused');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, light) values ('zz_light_extra', 'Lamp', 'camp', '{"color": "#ffb957", "bright": 20, "dim": 20, "flicker": true}') $$,
  '23514', null, 'a light with an unknown key is refused');
select throws_ok(
  $$ insert into public.library_dressing (id, name, group_key, light) values ('zz_light_none', 'Lamp', 'camp', '{"color": "#ffb957", "bright": 0, "dim": 0}') $$,
  '23514', null, 'a light with neither bright nor dim feet is refused');
delete from public.library_dressing where id = 'zz_light_ok';
with d as (delete from public.library_dressing where id = 'zz1062_probe' returning 1)
select is((select count(*)::int from d), 1, 'the admin deletes a prop');

-- ── the book icon ───────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select is(
  (select row(source_title, count)::text from public.get_library_dressing_sources() where source = 'grimoire-dressing'),
  row('Grimoire Dressing', 62::bigint)::text,
  'the dressing book is listed with its title and how many props it holds');
select is(
  (select entry_count from public.get_content_licenses() where key = 'grimoire-dressing'),
  62::bigint,
  'the Licences page counts the dressing book''s props');

-- ── the map layer ───────────────────────────────────────────────────────────

reset role;
select ok(
  (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'dungeon_maps' and column_name = 'layers') like '%"dressing": {}%',
  'a new map''s layers start with an empty dressing layer');

-- The source starts off: a new campaign and a new account do not get it. Asked
-- of rows made here rather than of the whole table, which a DM switching the
-- book on in a local stack would otherwise fail.
insert into public.campaigns (id, user_id, name, ruleset)
values ('10620000-0000-4000-8000-0000000000c1', '10620000-0000-4000-8000-000000000002', 'Ben''s table', '2024');
select is(
  (select count(*)::int from public.campaign_enabled_sources
    where source_slug = 'grimoire-dressing' and campaign_id = '10620000-0000-4000-8000-0000000000c1')
    + (select count(*)::int from public.user_enabled_sources
        where source_slug = 'grimoire-dressing' and user_id = '10620000-0000-4000-8000-000000000002'),
  0, 'a new campaign and a new account do not have the dressing book switched on');

-- #1065: a prop that lies on the floor is flagged flat (it casts no shadow of its own), a
-- standing one is not; the tile sets' groups exist; each set's book starts off like any book.
select is((select flat from public.library_dressing where id = 'dressing_rug'), true, 'a rug lies flat');
select is((select flat from public.library_dressing where id = 'dressing_wagon'), false, 'a wagon stands up');
select is(
  (select count(*)::int from public.content_sources where key = 'grimoire-dressing-sewers' and title = 'Grimoire Sewers'),
  1, 'the Sewers book exists under its own title');
set local role postgres;
select lives_ok(
  $$ insert into public.library_dressing (id, name, group_key) values ('zz1065_bridge', 'Probe bridge', 'crossings'),
                                                                     ('zz1065_nest', 'Probe nest', 'vermin') $$,
  'bridges and vermin are groups a prop may belong to');

select * from finish();
rollback;
