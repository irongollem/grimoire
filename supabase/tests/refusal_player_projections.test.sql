-- #936: the player projections and the one player-side combat write refuse a
-- caller who has no business with the row, and each refusal is paired with the
-- rightful caller succeeding on the same fixture, so a refusal cannot be a
-- broken fixture.
--
-- Cast (uuid suffix): 01 the DM of table c1, 02 Ada (player, character e1),
-- 03 Bo (player, character e2), 04 Sam (a stranger who runs their own table
-- c2 and so is a legitimate user of the app, just not of c1).
--
-- Everything at c1 is shared with Ada only, so Bo is a member who was not
-- given it and Sam is not a member at all.

begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93640000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'projections-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name) values
  ('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000001', 'Table one'),
  ('93640000-0000-4000-8000-0000000000c2', '93640000-0000-4000-8000-000000000004', 'Sam''s table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('93640000-0000-4000-8000-0000000000c2', '93640000-0000-4000-8000-000000000004', 'dm', 'Sam')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('93640000-0000-4000-8000-0000000000e1', '93640000-0000-4000-8000-000000000002', '93640000-0000-4000-8000-000000000002', '93640000-0000-4000-8000-0000000000c1', 'Ada''s ranger', '2014'),
  ('93640000-0000-4000-8000-0000000000e2', '93640000-0000-4000-8000-000000000003', '93640000-0000-4000-8000-000000000003', '93640000-0000-4000-8000-0000000000c1', 'Bo''s bard', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000002', 'player', 'Ada', '93640000-0000-4000-8000-0000000000e1'),
  ('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000003', 'player', 'Bo',  '93640000-0000-4000-8000-0000000000e2');

-- A running fight with Ada's and Bo's tokens on the board.
insert into public.encounters (id, user_id) values
  ('93640000-0000-4000-8000-0000000000f1', '93640000-0000-4000-8000-000000000001');
insert into public.encounter_state (id, encounter_id, campaign_id, user_id, is_running, combatants_live) values
  ('93640000-0000-4000-8000-0000000000f2', '93640000-0000-4000-8000-0000000000f1',
   '93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000001', true,
   jsonb_build_array(
     jsonb_build_object('instance_id', 'p-93640000-0000-4000-8000-0000000000e1', 'type', 'player', 'name', 'Ada''s ranger', 'initiative', 15),
     jsonb_build_object('instance_id', 'p-93640000-0000-4000-8000-0000000000e2', 'type', 'player', 'name', 'Bo''s bard', 'initiative', 12)));

-- A site shared with Ada, with one explored room.
insert into public.locations (id, user_id, campaign_id, name, location_type, map_url, is_map_shared, is_description_shared, description, player_visible_to) values
  ('93640000-0000-4000-8000-000000000051', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   'Caldron Caves', 'dungeon', 'https://example.invalid/map.webp', true, true, 'A cave.',
   array['93640000-0000-4000-8000-0000000000e1']::uuid[]);
insert into public.locations (id, user_id, campaign_id, name, location_type, parent_id) values
  ('93640000-0000-4000-8000-000000000052', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   'Sunken courtyard', 'room', '93640000-0000-4000-8000-000000000051');
-- A lair whose map is NOT shared: visible to Ada by name, to no one else.
insert into public.locations (id, user_id, campaign_id, name, location_type, player_visible_to) values
  ('93640000-0000-4000-8000-000000000054', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   'Hidden lair', 'dungeon', array['93640000-0000-4000-8000-0000000000e1']::uuid[]);
insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells, label, sort_order) values
  ('93640000-0000-4000-8000-000000000053', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-000000000051',
   '93640000-0000-4000-8000-000000000052', '["0,0","0,1"]'::jsonb, 'Courtyard', 1);
insert into public.location_state_events (user_id, location_id, fact, value) values
  ('93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-000000000052', 'explored', true);

-- A monster Ada has discovered (visible to her only), an NPC, a puzzle and a
-- quest shared with Ada, and a ready mini of Ada's character.
insert into public.monsters (id, user_id, name) values
  ('93640000-0000-4000-8000-000000000061', '93640000-0000-4000-8000-000000000001', 'Owlbear');
insert into public.discovered_monsters (campaign_id, monster_id, visible_to, reveal_stats) values
  ('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000061',
   array['93640000-0000-4000-8000-0000000000e1']::uuid[], true);
insert into public.npcs (id, user_id, campaign_id, name, player_visible_fields, player_visible_to) values
  ('93640000-0000-4000-8000-000000000062', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   'Mara', array['name']::text[], array['93640000-0000-4000-8000-0000000000e1']::uuid[]);
insert into public.puzzle_rooms (id, user_id, campaign_id, name, player_visible_to) values
  ('93640000-0000-4000-8000-000000000063', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   'The riddle door', array['93640000-0000-4000-8000-0000000000e1']::uuid[]);
insert into public.quests (id, user_id, campaign_id, player_visible_to) values
  ('93640000-0000-4000-8000-000000000064', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   array['93640000-0000-4000-8000-0000000000e1']::uuid[]);
insert into public.minis (id, user_id, campaign_id, source_table, source_id, format, status) values
  ('93640000-0000-4000-8000-000000000065', '93640000-0000-4000-8000-000000000001', '93640000-0000-4000-8000-0000000000c1',
   'party_members', '93640000-0000-4000-8000-0000000000e1', 'vtt', 'ready');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93640000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- ── get_player_encounter_state ──────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_encounter_state('93640000-0000-4000-8000-0000000000c1') $$,
  'a player at the table sees the running fight');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_encounter_state('93640000-0000-4000-8000-0000000000c1') $$,
  'a stranger asking for another table''s fight gets nothing');

-- ── get_player_visible_locations ────────────────────────────────────────────

select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_visible_locations('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000054') $$,
  'the player a site is shared with sees it');

select pg_temp.as_user(3);
select is_empty($$ select * from public.get_player_visible_locations('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000054') $$,
  'a member it was not shared with sees nothing, even naming the location');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_visible_locations('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000054') $$,
  'a stranger naming another table''s campaign and location sees nothing');
select is_empty($$ select * from public.get_player_visible_locations(null, '93640000-0000-4000-8000-000000000054') $$,
  'and leaving the campaign out does not widen it');

-- ── get_player_visible_mini ─────────────────────────────────────────────────

select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_visible_mini('party_members', '93640000-0000-4000-8000-0000000000e1') $$,
  'a member of the campaign sees the ready mini of a party member');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_visible_mini('party_members', '93640000-0000-4000-8000-0000000000e1') $$,
  'a stranger naming someone else''s mini gets nothing');

-- ── get_player_visible_monsters ─────────────────────────────────────────────

select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_visible_monsters('93640000-0000-4000-8000-0000000000c1') $$,
  'the player who discovered a monster sees it');

select pg_temp.as_user(3);
select is_empty($$ select * from public.get_player_visible_monsters('93640000-0000-4000-8000-0000000000c1') $$,
  'a member the discovery was not shared with sees no monster');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_visible_monsters('93640000-0000-4000-8000-0000000000c1') $$,
  'a stranger naming another table''s campaign sees no monster');

-- ── get_player_visible_npcs ─────────────────────────────────────────────────

select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_visible_npcs('93640000-0000-4000-8000-0000000000c1') $$,
  'the player an NPC is shared with sees it');

select pg_temp.as_user(3);
select is_empty($$ select * from public.get_player_visible_npcs('93640000-0000-4000-8000-0000000000c1') $$,
  'a member it was not shared with sees no NPC');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_visible_npcs('93640000-0000-4000-8000-0000000000c1') $$,
  'a stranger naming another table''s campaign sees no NPC');
select is_empty($$ select * from public.get_player_visible_npcs('93640000-0000-4000-8000-0000000000c1', null, '93640000-0000-4000-8000-0000000000e1') $$,
  'nor does naming a character to preview as make a stranger a DM');

select pg_temp.as_user(1);
select isnt_empty($$ select * from public.get_player_visible_npcs('93640000-0000-4000-8000-0000000000c1', null, '93640000-0000-4000-8000-0000000000e1') $$,
  'the DM of the table previewing as that character does see it');

-- ── get_player_visible_puzzles ──────────────────────────────────────────────

select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_visible_puzzles('93640000-0000-4000-8000-0000000000c1') $$,
  'the player a puzzle is shared with sees it');

select pg_temp.as_user(3);
select is_empty($$ select * from public.get_player_visible_puzzles('93640000-0000-4000-8000-0000000000c1') $$,
  'a member it was not shared with sees no puzzle');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_visible_puzzles('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000063') $$,
  'a stranger naming another table''s puzzle sees nothing');
select throws_ok($$ select * from public.get_player_visible_puzzles(null, null, '93640000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Preview audience is not available to this DM',
  'a DM of a different table cannot preview as someone else''s character');

select pg_temp.as_user(1);
select lives_ok($$ select * from public.get_player_visible_puzzles('93640000-0000-4000-8000-0000000000c1', null, '93640000-0000-4000-8000-0000000000e1') $$,
  'the table''s own DM can preview as that character');

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok($$ select * from public.get_player_visible_puzzles('93640000-0000-4000-8000-0000000000c1') $$,
  'P0001', 'Authentication required',
  'a token with no subject is refused rather than treated as nobody');
reset role;

-- ── get_player_visible_quests ───────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(2);
select isnt_empty($$ select * from public.get_player_visible_quests('93640000-0000-4000-8000-0000000000c1') $$,
  'the player a quest is shared with sees it');

select pg_temp.as_user(3);
select is_empty($$ select * from public.get_player_visible_quests('93640000-0000-4000-8000-0000000000c1') $$,
  'a member it was not shared with sees no quest');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_visible_quests('93640000-0000-4000-8000-0000000000c1', '93640000-0000-4000-8000-000000000064') $$,
  'a stranger naming another table''s quest sees nothing');
select throws_ok($$ select * from public.get_player_visible_quests(null, null, '93640000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Preview audience is not available to this DM',
  'a DM of a different table cannot preview quests as someone else''s character');

select pg_temp.as_user(1);
select lives_ok($$ select * from public.get_player_visible_quests('93640000-0000-4000-8000-0000000000c1', null, '93640000-0000-4000-8000-0000000000e1') $$,
  'the table''s own DM can preview quests as that character');

-- ── get_player_visible_site_state ───────────────────────────────────────────
-- The function always answers with an object; refusing means the arrays are
-- empty, so the assertions unnest what it reports.

select pg_temp.as_user(2);
select isnt_empty($$ select jsonb_array_elements(public.get_player_visible_site_state('93640000-0000-4000-8000-000000000051') -> 'spaces') $$,
  'the player the site is shared with sees its explored room');

select pg_temp.as_user(3);
select is_empty($$ select jsonb_array_elements(public.get_player_visible_site_state('93640000-0000-4000-8000-000000000051') -> 'spaces') $$,
  'a member the site was not shared with learns no room');

select pg_temp.as_user(4);
select is_empty($$ select jsonb_array_elements(public.get_player_visible_site_state('93640000-0000-4000-8000-000000000051') -> 'spaces') $$,
  'a stranger naming another table''s site learns no room');
select is_empty($$ select jsonb_array_elements(public.get_player_visible_site_state('93640000-0000-4000-8000-000000000051', '93640000-0000-4000-8000-0000000000e1') -> 'spaces') $$,
  'and naming a character to preview as does not make them a DM');

-- ── update_combatant_position ───────────────────────────────────────────────

select pg_temp.as_user(4);
select throws_ok($$ select public.update_combatant_position('93640000-0000-4000-8000-0000000000f2', 'p-93640000-0000-4000-8000-0000000000e1', '{"x":9,"y":9}'::jsonb) $$,
  'P0001', 'not a member of this campaign',
  'a stranger cannot move a token on another table''s board');

select pg_temp.as_user(3);
select throws_ok($$ select public.update_combatant_position('93640000-0000-4000-8000-0000000000f2', 'p-93640000-0000-4000-8000-0000000000e1', '{"x":9,"y":9}'::jsonb) $$,
  'P0001', 'can only update own combatant''s position',
  'a player cannot move another player''s token');

select pg_temp.as_user(2);
select lives_ok($$ select public.update_combatant_position('93640000-0000-4000-8000-0000000000f2', 'p-93640000-0000-4000-8000-0000000000e1', '{"x":3,"y":4}'::jsonb) $$,
  'a player moves their own token');

reset role;
select is(
  (select c -> 'position' from public.encounter_state s, jsonb_array_elements(s.combatants_live) c
    where s.id = '93640000-0000-4000-8000-0000000000f2' and c ->> 'instance_id' = 'p-93640000-0000-4000-8000-0000000000e1'),
  '{"x":3,"y":4}'::jsonb, 'their own token moved');
select is(
  (select c -> 'position' from public.encounter_state s, jsonb_array_elements(s.combatants_live) c
    where s.id = '93640000-0000-4000-8000-0000000000f2' and c ->> 'instance_id' = 'p-93640000-0000-4000-8000-0000000000e2'),
  null, 'and nobody else''s token did');

select * from finish();
rollback;
