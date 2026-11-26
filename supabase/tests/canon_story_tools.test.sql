-- #1255 items 11, 17, 20, 21 and 31: arcs, the deleted list, a quest clock that moves a force, a beat tied to a canon
-- secret, and ecology. Every refusal sits beside the allowed write it is one mistake away from.
--
--   1 Dana (DM)   2 Pat (a player at Dana's table)   3 Cole (Dana's co-DM)

begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('12557000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'story-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-000000000001', 'The Salt Road', 'dnd5e-2024');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-000000000002', 'player', 'Pat'),
  ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-000000000003', 'dm', 'Cole');

insert into public.locations (id, user_id, campaign_id, name) values
  ('12557000-0000-4000-8000-0000000000a1', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'Saltmere'),
  ('12557000-0000-4000-8000-0000000000a2', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'The marsh');
insert into public.npcs (id, user_id, campaign_id, name) values
  ('12557000-0000-4000-8000-0000000000b1', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'Maren Voss');
insert into public.quests (id, user_id, campaign_id, title) values
  ('12557000-0000-4000-8000-0000000000d1', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'The Missing Tide-Bell');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('12557000-0000-4000-8000-0000000000d2', '12557000-0000-4000-8000-0000000000d1', '12557000-0000-4000-8000-0000000000c1', 'The ledger');
insert into public.quest_clocks (id, quest_id, campaign_id, label, segments) values
  ('12557000-0000-4000-8000-0000000000d3', '12557000-0000-4000-8000-0000000000d1', '12557000-0000-4000-8000-0000000000c1', 'The tide rises', 6);

insert into public.canon_entries (id, user_id, campaign_id, part, title, wants, clock_size, knowledge, premise_kind) values
  ('12557000-0000-4000-8000-0000000000e1', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'secret', 'Maren sold the bell', null, null, null, null),
  ('12557000-0000-4000-8000-0000000000e2', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'force', 'The Brine Court', 'Every salt pan', 6, null, null),
  ('12557000-0000-4000-8000-0000000000e3', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'truth', 'Salt is money', null, null, 'all', null),
  ('12557000-0000-4000-8000-0000000000e4', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'premise', 'Debts outlive the debtor', null, null, null, 'theme');
insert into public.canon_clues (id, user_id, campaign_id, secret_id, title, location_id, sort_order) values
  ('12557000-0000-4000-8000-0000000000f1', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000e1', 'Rope burns on the beam', '12557000-0000-4000-8000-0000000000a2', 0),
  ('12557000-0000-4000-8000-0000000000f2', '12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000e1', 'A ledger page', null, 1);
insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_npc_id, type) values
  ('12557000-0000-4000-8000-000000000001', '12557000-0000-4000-8000-0000000000c1', 'canon', '12557000-0000-4000-8000-0000000000e1', 'npc', '12557000-0000-4000-8000-0000000000b1', 'about');
insert into public.library_monsters (id, name, monster_type, stat_block, ruleset, conceptual_key, source_document_key, source_record_key)
select 'test_1255_eel', 'Marsh eel', m.monster_type, m.stat_block, m.ruleset, 'test_1255_eel', 'test-1255', 'eel'
  from public.library_monsters m limit 1;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"12557000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;
select pg_temp.as_user(1);

-- ── 1. Arcs ──
select lives_ok($$
  insert into public.canon_arcs (id, campaign_id, name) values ('12557000-0000-4000-8000-0000000000a9', '12557000-0000-4000-8000-0000000000c1', 'The drowned god');
  update public.canon_entries set arc_id = '12557000-0000-4000-8000-0000000000a9' where id = '12557000-0000-4000-8000-0000000000e1';
$$, 'the DM makes an arc and puts a secret in it');
select throws_ok($$
  update public.canon_entries set arc_id = '12557000-0000-4000-8000-0000000000a9' where id = '12557000-0000-4000-8000-0000000000e4'
$$, '23514', null, 'the premise is never one arc''s');

-- ── 3. A quest clock that moves a force ──
select throws_ok($$
  update public.quest_clocks set moves_force_id = '12557000-0000-4000-8000-0000000000e1' where id = '12557000-0000-4000-8000-0000000000d3'
$$, '23514', null, 'a quest clock moves a force, never a secret');
select lives_ok($$
  update public.quest_clocks set moves_force_id = '12557000-0000-4000-8000-0000000000e2' where id = '12557000-0000-4000-8000-0000000000d3'
$$, 'a quest clock is set to move a force');
select public.tick_quest_clock('12557000-0000-4000-8000-0000000000d3', 2, 'The bell was cut down');
select results_eq(
  $$select delta::int, note from public.canon_force_ticks where force_id = '12557000-0000-4000-8000-0000000000e2' order by created_at$$,
  $$values (2, 'Quest clock: The tide rises')$$,
  'ticking the quest clock through the run screen''s own call ticks the force by as much, and says why');
select public.tick_quest_clock('12557000-0000-4000-8000-0000000000d3', -1, 'Bailed out');
select is((select sum(delta)::int from public.canon_force_ticks where force_id = '12557000-0000-4000-8000-0000000000e2'), 1,
  'ticking it back ticks the force back');
update public.quest_clocks set label = 'The tide' where id = '12557000-0000-4000-8000-0000000000d3';
select is((select count(*)::int from public.canon_force_ticks where force_id = '12557000-0000-4000-8000-0000000000e2'), 2,
  'renaming the clock moves nothing');
update public.canon_entries set closed_as = 'stopped', closed_at = now() where id = '12557000-0000-4000-8000-0000000000e2';
select public.tick_quest_clock('12557000-0000-4000-8000-0000000000d3', 2, 'Again');
select is((select count(*)::int from public.canon_force_ticks where force_id = '12557000-0000-4000-8000-0000000000e2'), 2,
  'an ended force does not move');
update public.canon_entries set closed_as = null, closed_at = null where id = '12557000-0000-4000-8000-0000000000e2';

-- ── 4. A beat tied to a canon secret ──
select throws_ok($$
  update public.quest_beats set canon_secret_id = '12557000-0000-4000-8000-0000000000e2' where id = '12557000-0000-4000-8000-0000000000d2'
$$, '23514', null, 'a beat''s secret is a secret, never a force');
select lives_ok($$
  update public.quest_beats set canon_secret_id = '12557000-0000-4000-8000-0000000000e1' where id = '12557000-0000-4000-8000-0000000000d2'
$$, 'a beat is tied to a canon secret');

-- ── 5. Ecology ──
select lives_ok($$
  insert into public.campaign_habitats (id, campaign_id, name) values ('12557000-0000-4000-8000-0000000000aa', '12557000-0000-4000-8000-0000000000c1', 'Salt marsh');
  insert into public.campaign_habitat_places (campaign_id, habitat_id, location_id) values ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000aa', '12557000-0000-4000-8000-0000000000a2');
  insert into public.campaign_species (id, campaign_id, name) values ('12557000-0000-4000-8000-0000000000b1', '12557000-0000-4000-8000-0000000000c1', 'Marsh eel');
  insert into public.campaign_species_forms (id, campaign_id, species_id, label, library_monster_id) values ('12557000-0000-4000-8000-0000000000b2', '12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000b1', 'Adult', 'test_1255_eel');
  insert into public.campaign_habitat_species (campaign_id, habitat_id, species_id, abundance) values ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000aa', '12557000-0000-4000-8000-0000000000b1', 'common');
  insert into public.campaign_habitat_life (campaign_id, habitat_id, species_id, form_id, percent) values ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000aa', '12557000-0000-4000-8000-0000000000b1', '12557000-0000-4000-8000-0000000000b2', 70);
  update public.canon_entries set habitat_id = '12557000-0000-4000-8000-0000000000aa' where id = '12557000-0000-4000-8000-0000000000e3';
$$, 'the DM writes a habitat, the place it covers, what lives there and a truth of it');
select throws_ok($$
  update public.canon_entries set habitat_id = '12557000-0000-4000-8000-0000000000aa' where id = '12557000-0000-4000-8000-0000000000e1'
$$, '23514', null, 'only a truth belongs to a habitat');
select throws_ok($$
  insert into public.campaign_species_forms (campaign_id, species_id, label, library_monster_id) values ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000b1', 'Old', 'no_such_creature')
$$, '23503', null, 'a creature is never typed: an id the bestiary does not have is refused');
select throws_ok($$
  insert into public.campaign_habitat_places (campaign_id, habitat_id, location_id) values ('12557000-0000-4000-8000-0000000000c1', '12557000-0000-4000-8000-0000000000aa', '12557000-0000-4000-8000-0000000000a2')
$$, '23505', null, 'a place lies in one habitat');
select throws_ok($$
  do $do$ begin
    update public.campaign_habitat_life set percent = 120 where form_id = '12557000-0000-4000-8000-0000000000b2';
  end $do$
$$, '23514', null, 'a share above a hundred is refused');
select is((select name from public.campaign_habitat_life_named where habitat_id = '12557000-0000-4000-8000-0000000000aa'), 'Marsh eel',
  'what lives there is read by name');

-- ── 2. The deleted list ──
select pg_temp.as_user(2);
select throws_ok($$ select public.trash_canon_entry('12557000-0000-4000-8000-0000000000e1') $$, 'P0002', null,
  'a player cannot delete a canon entry');
select pg_temp.as_user(1);
select is((select count(*)::int from public.canon_entries where id = '12557000-0000-4000-8000-0000000000e1'), 1,
  'and the entry is still there');

select lives_ok($$ select public.trash_canon_entry('12557000-0000-4000-8000-0000000000e1') $$, 'the DM deletes a secret');
select is((select count(*)::int from public.canon_entries where id = '12557000-0000-4000-8000-0000000000e1'), 0, 'it is gone from the canon');
select is((select count(*)::int from public.canon_clues where secret_id = '12557000-0000-4000-8000-0000000000e1'), 0, 'with its clues');
select is((select canon_secret_id from public.quest_beats where id = '12557000-0000-4000-8000-0000000000d2'), null, 'and the beat no longer points at it');
select is((select title from public.canon_trash where entry_id = '12557000-0000-4000-8000-0000000000e1'), 'Maren sold the bell', 'it is on the deleted list');

select pg_temp.as_user(2);
select is_empty($$ select 1 from public.canon_trash $$, 'a player does not read the deleted list');

-- A clue's place is deleted while the secret is in the trash: the clue comes back unplaced, not lost.
select pg_temp.as_user(1);
delete from public.locations where id = '12557000-0000-4000-8000-0000000000a2';

-- The co-DM restores it, and the rows come back as the co-DM's.
select pg_temp.as_user(3);
select lives_ok($$ select public.restore_canon_entry((select id from public.canon_trash where entry_id = '12557000-0000-4000-8000-0000000000e1')) $$,
  'a co-DM restores it');
select results_eq(
  $$select title, location_id from public.canon_clues where secret_id = '12557000-0000-4000-8000-0000000000e1' order by sort_order$$,
  $$values ('Rope burns on the beam'::text, null::uuid), ('A ledger page', null::uuid)$$,
  'its clues come back, the one whose place was deleted unplaced');
select is((select count(*)::int from public.world_links where from_canon_entry_id = '12557000-0000-4000-8000-0000000000e1'), 1, 'its tie to Maren comes back');
select is((select canon_secret_id from public.quest_beats where id = '12557000-0000-4000-8000-0000000000d2'), '12557000-0000-4000-8000-0000000000e1'::uuid,
  'the beat points at it again');
select is((select user_id from public.canon_entries where id = '12557000-0000-4000-8000-0000000000e1'), '12557000-0000-4000-8000-000000000003'::uuid,
  'and it comes back as the restoring DM''s');
select is_empty($$ select 1 from public.canon_trash $$, 'and it leaves the deleted list');

reset role;
select * from finish();
rollback;
