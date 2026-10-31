-- #1060: the Dungeon Craft library (library_traps, library_dungeon_features, library_puzzles) and the
-- library columns on the rows that cite it, from migration 20261014070034_dungeon_craft_library.
--
--   1 Ada (app admin)   2 Ben (ordinary DM, owns the campaign)   3 Cal (player of Ben's campaign)
--
-- Library rows are read by everyone and written by admins only; a library reference is a real foreign key
-- with on delete restrict, part of the placement arc, with a trigger standing in for the encounter array.

begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('10600000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'dungeon-craft-library-' || n || '@example.invalid', '',
       case when n = 1 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 3) as n;

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"10600000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"10600000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

insert into public.campaigns (id, user_id, name)
values ('10600000-0000-4000-8000-000000000010', '10600000-0000-4000-8000-000000000002', 'Library table');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10600000-0000-4000-8000-000000000010', '10600000-0000-4000-8000-000000000002', 'dm', 'Ben')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
values ('10600000-0000-4000-8000-0000000000e1', '10600000-0000-4000-8000-000000000003', '10600000-0000-4000-8000-000000000003',
        '10600000-0000-4000-8000-000000000010', 'Cal''s ranger', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id)
values ('10600000-0000-4000-8000-000000000010', '10600000-0000-4000-8000-000000000003', 'player', 'Cal', '10600000-0000-4000-8000-0000000000e1');

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('10600000-0000-4000-8000-000000000020', '10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', 'The Vault', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('10600000-0000-4000-8000-000000000021', '10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', '10600000-0000-4000-8000-000000000020', 'Reliquary', 'room'),
  ('10600000-0000-4000-8000-000000000022', '10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', '10600000-0000-4000-8000-000000000020', 'Nave', 'room');

insert into public.traps (id, user_id, campaign_id, name)
values ('10600000-0000-4000-8000-000000000030', '10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', 'Needle lock');

set local role authenticated;

-- ── reads and writes ────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select cmp_ok((select count(*)::int from public.library_traps), '>', 0, 'an ordinary user reads the seeded library traps');
select cmp_ok((select count(*)::int from public.library_dungeon_features), '>', 0, 'an ordinary user reads the library dungeon features');
select cmp_ok((select count(*)::int from public.library_puzzles), '>', 0, 'an ordinary user reads the library puzzles');

select throws_ok(
  $$ insert into public.library_traps (id, name) values ('zz1060_probe', 'Probe') $$,
  '42501', null, 'an ordinary user cannot insert a library trap');
-- A policy with no matching row for update/delete is silent: 0 rows affected, not an error.
with u as (update public.library_traps set name = 'Hacked' where id = 'grimoire_hidden_pit' returning 1)
select is((select count(*)::int from u), 0, 'an ordinary user updates no library trap row');
with d as (delete from public.library_traps where id = 'grimoire_hidden_pit' returning 1)
select is((select count(*)::int from d), 0, 'an ordinary user deletes no library trap row');

select pg_temp.as_user(1, true);
select lives_ok(
  $$ insert into public.library_traps (id, name) values ('zz1060_probe', 'Probe') $$,
  'the admin inserts a library trap');

-- ── placements ──────────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select lives_ok(
  $$ insert into public.location_placements (user_id, location_id, library_trap_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000021', 'grimoire_hidden_pit') $$,
  'a placement naming only a library trap is accepted');
select throws_ok(
  $$ insert into public.location_placements (user_id, location_id, library_trap_id, trap_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000022', 'grimoire_hidden_pit', '10600000-0000-4000-8000-000000000030') $$,
  '23514', null, 'a placement naming a library trap and an own trap is refused');
select throws_ok(
  $$ insert into public.location_placements (user_id, location_id, library_trap_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000021', 'grimoire_hidden_pit') $$,
  '23505', null, 'the same library trap twice in one location is refused');
select lives_ok(
  $$ insert into public.location_placements (user_id, location_id, library_trap_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000022', 'grimoire_hidden_pit') $$,
  'the same library trap in a second location is accepted (positive control)');
select throws_ok(
  $$ insert into public.location_placements (user_id, location_id, library_trap_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000022', 'zz_no_such_trap') $$,
  '23503', null, 'an unknown library trap id is refused');

-- ── encounters ──────────────────────────────────────────────────────────────

select lives_ok(
  $$ insert into public.encounters (user_id, campaign_id, name, library_trap_ids)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', 'Pit fight', array['grimoire_hidden_pit']) $$,
  'an encounter citing a real library trap slug is accepted');
select throws_ok(
  $$ insert into public.encounters (user_id, campaign_id, name, library_trap_ids)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', 'Ghost trap', array['zz_no_such_trap']) $$,
  '23503', null, 'an encounter citing an unknown library trap slug is refused');
select throws_ok(
  $$ insert into public.encounters (user_id, campaign_id, name, library_trap_ids)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', 'Null trap', array['grimoire_hidden_pit', null]) $$,
  '23503', null, 'a NULL element in library_trap_ids is refused, beside a real slug');

-- ── doors and puzzles: at most one feature column ──────────────────────────

reset role;
insert into public.dungeon_features (id, user_id, name)
values ('10600000-0000-4000-8000-000000000031', '10600000-0000-4000-8000-000000000002', 'Own collapsing floor');
set local role authenticated;
select pg_temp.as_user(2);

select throws_ok(
  $$ insert into public.location_doors (user_id, from_location_id, to_location_id, label, dungeon_feature_id, library_dungeon_feature_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000021', '10600000-0000-4000-8000-000000000022', 'both',
             '10600000-0000-4000-8000-000000000031', (select id from public.library_dungeon_features order by id limit 1)) $$,
  '23514', null, 'a door citing an own and a library feature is refused');
select throws_ok(
  $$ insert into public.puzzle_rooms (user_id, campaign_id, name, dungeon_feature_id, library_dungeon_feature_id)
     values ('10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010', 'both',
             '10600000-0000-4000-8000-000000000031', (select id from public.library_dungeon_features order by id limit 1)) $$,
  '23514', null, 'a puzzle anchored to an own and a library feature is refused');

-- ── delete restrict, as admin ───────────────────────────────────────────────

select pg_temp.as_user(1, true);
select throws_ok(
  $$ delete from public.library_traps where id = 'grimoire_hidden_pit' $$,
  '23503', null, 'the admin cannot delete a library trap a placement uses');

-- ── the player projection still works ───────────────────────────────────────

reset role;
insert into public.puzzle_rooms (id, user_id, campaign_id, name, player_visible_to, library_dungeon_feature_id)
values ('10600000-0000-4000-8000-000000000081', '10600000-0000-4000-8000-000000000002', '10600000-0000-4000-8000-000000000010',
        'The riddle door', array['10600000-0000-4000-8000-0000000000e1']::uuid[], (select id from public.library_dungeon_features order by id limit 1));
set local role authenticated;
select pg_temp.as_user(3);
select is(
  (select count(*)::int from public.get_player_visible_puzzles('10600000-0000-4000-8000-000000000010')
    where id = '10600000-0000-4000-8000-000000000081'),
  1, 'get_player_visible_puzzles still returns a visible puzzle');
select is(
  (select library_dungeon_feature_id from public.get_player_visible_puzzles('10600000-0000-4000-8000-000000000010')
    where id = '10600000-0000-4000-8000-000000000081'),
  null, 'the projection withholds the library feature anchor');

-- ── the library feature mirrors the owned one, column for column ─────────────
-- Customize copies a library row into dungeon_features by spreading every content column
-- (src/lib/dungeon-features/libraryCopy.ts), so a column the owned table gains and the
-- library lacks is a stat no library feature can carry (20261030214202 added seven to both).
select is_empty($$
  select column_name, data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'dungeon_features'
     and column_name not in ('id', 'user_id', 'campaign_id', 'ai_provenance', 'created_at', 'updated_at')
  except
  select column_name, data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'library_dungeon_features'
$$, 'library_dungeon_features has every content column of dungeon_features, with the same type');

-- ── every library object follows the book ───────────────────────────────────
-- DMG "Objects" (2014 and 2024 alike): Object Armor Class by material, Object Hit Points
-- by size, fragile or resilient. A library entry is the book's object, so a seed that
-- typos an AC or gives hit points off the table fails here (20261030231807). A material
-- without a size, or the reverse, is a half-entered object.
select is_empty($$
  select f.id from public.library_dungeon_features f
    left join (values ('cloth', 11), ('crystal', 13), ('wood', 15), ('stone', 17), ('iron', 19), ('mithral', 21), ('adamantine', 23))
           as ac(material, value) on ac.material = f.object_material
    left join (values ('tiny', 2, 5), ('small', 3, 10), ('medium', 4, 18), ('large', 5, 27))
           as hp(size, fragile, resilient) on hp.size = f.object_size
   where (f.object_material is null) <> (f.object_size is null)
      or (f.object_material is not null and (f.object_ac is distinct from ac.value
          or f.object_hp not in (hp.fragile, hp.resilient) or f.object_hp is null))
$$, 'every library object has the DMG AC for its material and DMG hit points for its size');

select * from finish();
rollback;
