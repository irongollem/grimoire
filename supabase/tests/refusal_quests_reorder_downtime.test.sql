-- #936: the definer registry says these ten functions refuse the wrong caller.
-- This file makes each of them prove it, as the caller who must not be let in,
-- with a rightful caller beside it so a refusal is never just a broken fixture.
--
--   u1 DM of c1      u2 player in c1 (plays e1)      u3 stranger, DM of c2
--
-- The attack is always u3 (signed in, legitimate, with a table of their own)
-- naming a row that belongs to c1 or to u1/u2. u2 is the second attacker where
-- a function is DM-only.

begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93650000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-qrd-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name) values
  ('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-000000000001', 'QRD table'),
  ('93650000-0000-4000-8000-0000000000c2', '93650000-0000-4000-8000-000000000003', 'Stranger table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('93650000-0000-4000-8000-0000000000e1', '93650000-0000-4000-8000-000000000002',
        '93650000-0000-4000-8000-000000000002', null, 'QRD ranger');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-000000000002', 'player', 'Player', '93650000-0000-4000-8000-0000000000e1'),
  ('93650000-0000-4000-8000-0000000000c2', '93650000-0000-4000-8000-000000000003', 'dm', 'Stranger', null)
on conflict (campaign_id, user_id) do update
  set role = excluded.role, party_member_id = excluded.party_member_id;

-- Quest runtime: one quest with an objective, a beat, and a held consequence.
insert into public.quests (id, user_id, campaign_id, title) values
  ('93650000-0000-4000-8000-000000000091', '93650000-0000-4000-8000-000000000001',
   '93650000-0000-4000-8000-0000000000c1', 'QRD quest');
insert into public.quest_objectives (id, quest_id, status) values
  ('93650000-0000-4000-8000-000000000092', '93650000-0000-4000-8000-000000000091', 'pending');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('93650000-0000-4000-8000-000000000093', '93650000-0000-4000-8000-000000000091',
   '93650000-0000-4000-8000-0000000000c1', 'QRD beat');
insert into public.quest_beat_transitions (id, campaign_id, from_quest_id, to_quest_id, transition_kind)
values ('93650000-0000-4000-8000-000000000094', '93650000-0000-4000-8000-0000000000c1',
        '93650000-0000-4000-8000-000000000091', '93650000-0000-4000-8000-000000000091', 'assert');
insert into public.quest_consequence_events (id, campaign_id, quest_id, transition_id, action, target_objective_id)
values ('93650000-0000-4000-8000-000000000095', '93650000-0000-4000-8000-0000000000c1',
        '93650000-0000-4000-8000-000000000091', '93650000-0000-4000-8000-000000000094', 'complete',
        '93650000-0000-4000-8000-000000000092');

-- Personal rows the reorder RPCs act on. The first three belong to u1, the
-- inventory item to c1's table, the journal entry and sound to u2.
insert into public.notes (id, user_id, title, sort_order) values
  ('93650000-0000-4000-8000-0000000000a1', '93650000-0000-4000-8000-000000000001', 'QRD note', 1);
insert into public.player_journal_entries (id, user_id, campaign_id, sort_order) values
  ('93650000-0000-4000-8000-0000000000a2', '93650000-0000-4000-8000-000000000002',
   '93650000-0000-4000-8000-0000000000c1', 1);
insert into public.soundboard_pages (id, campaign_id, user_id, name, sort_order) values
  ('93650000-0000-4000-8000-0000000000a3', '93650000-0000-4000-8000-0000000000c1',
   '93650000-0000-4000-8000-000000000001', 'QRD page', 1);
insert into public.sounds (id, user_id, campaign_id, name, file_url, sort_order) values
  ('93650000-0000-4000-8000-0000000000a4', '93650000-0000-4000-8000-000000000001',
   '93650000-0000-4000-8000-0000000000c1', 'QRD sound', 'https://example.invalid/qrd.mp3', 1);
insert into public.party_inventory (id, campaign_id, user_id, name, sort_order) values
  ('93650000-0000-4000-8000-0000000000f1', '93650000-0000-4000-8000-0000000000c1',
   '93650000-0000-4000-8000-000000000001', 'QRD lantern', 1);

-- Downtime: e1 was granted two credits, one already spent on d1 (a pending
-- draw in c1), so one is left to spend.
insert into public.downtime_grants (campaign_id, party_member_id, amount) values
  ('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-0000000000e1', 2);
insert into public.downtime_draws (id, campaign_id, party_member_id, activity_key) values
  ('93650000-0000-4000-8000-0000000000d1', '93650000-0000-4000-8000-0000000000c1',
   '93650000-0000-4000-8000-0000000000e1', 'carousing');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93650000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── assert_quest_objective_status (DM of the quest's own campaign) ───────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.assert_quest_objective_status('93650000-0000-4000-8000-000000000092', 'complete') $$,
  'P0001', 'Not authorized',
  'assert_quest_objective_status: another campaign''s DM cannot assert an objective of c1');

select pg_temp.as_user(2);
select throws_ok(
  $$ select public.assert_quest_objective_status('93650000-0000-4000-8000-000000000092', 'complete') $$,
  'P0001', 'Not authorized',
  'assert_quest_objective_status: a player in c1 cannot assert its objective');

select pg_temp.as_user(1);
select is(
  public.assert_quest_objective_status('93650000-0000-4000-8000-000000000092', 'complete') ->> 'changed', 'true',
  'assert_quest_objective_status: the DM of c1 can (positive control)');
select is((select status from public.quest_objectives where id = '93650000-0000-4000-8000-000000000092'), 'complete',
  'assert_quest_objective_status: the DM''s call moved the objective');

-- ── perform_quest_consequence (DM of the event's campaign) ──────────────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.perform_quest_consequence('93650000-0000-4000-8000-000000000095', 1490, 1, 1) $$,
  'P0001', 'Not authorized',
  'perform_quest_consequence: another campaign''s DM cannot fire c1''s held consequence');

select pg_temp.as_user(2);
select throws_ok(
  $$ select public.perform_quest_consequence('93650000-0000-4000-8000-000000000095', 1490, 1, 1) $$,
  'P0001', 'Not authorized',
  'perform_quest_consequence: a player in c1 cannot fire it');

select pg_temp.as_user(1);
select lives_ok(
  $$ select public.perform_quest_consequence('93650000-0000-4000-8000-000000000095', 1490, 1, 1) $$,
  'perform_quest_consequence: the DM of c1 can (positive control)');
select isnt((select performed_at from public.quest_consequence_events where id = '93650000-0000-4000-8000-000000000095'), null,
  'perform_quest_consequence: the DM''s call performed the event');

-- ── search_quest_runtime_jump_targets (DM of the named campaign) ────────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select * from public.search_quest_runtime_jump_targets('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-000000000091', '') $$,
  'P0001', 'Not authorized',
  'search_quest_runtime_jump_targets: another campaign''s DM cannot list c1''s beats');

select pg_temp.as_user(2);
select throws_ok(
  $$ select * from public.search_quest_runtime_jump_targets('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-000000000091', '') $$,
  'P0001', 'Not authorized',
  'search_quest_runtime_jump_targets: a player in c1 cannot list its beats (spoilers)');

select pg_temp.as_user(1);
select isnt_empty(
  $$ select * from public.search_quest_runtime_jump_targets('93650000-0000-4000-8000-0000000000c1', '93650000-0000-4000-8000-000000000091', 'QRD') $$,
  'search_quest_runtime_jump_targets: the DM of c1 sees the beat (positive control)');

-- ── reorder_notes / reorder_player_journal_entries / reorder_soundboard_pages
--    / reorder_sounds: the caller's own rows only ─────────────────────────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.reorder_notes(array['93650000-0000-4000-8000-0000000000a1']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given notes',
  'reorder_notes: a stranger cannot reorder another user''s note');
select throws_ok(
  $$ select public.reorder_player_journal_entries(array['93650000-0000-4000-8000-0000000000a2']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given journal entries',
  'reorder_player_journal_entries: a stranger cannot reorder another player''s entry');
select throws_ok(
  $$ select public.reorder_soundboard_pages(array['93650000-0000-4000-8000-0000000000a3']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given soundboard pages',
  'reorder_soundboard_pages: a stranger cannot reorder another user''s page');
select throws_ok(
  $$ select public.reorder_sounds(array['93650000-0000-4000-8000-0000000000a4']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given sounds',
  'reorder_sounds: a stranger cannot reorder another user''s sound');

-- A member of c1 who is not the owner is still not the owner.
select pg_temp.as_user(2);
select throws_ok(
  $$ select public.reorder_soundboard_pages(array['93650000-0000-4000-8000-0000000000a3']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given soundboard pages',
  'reorder_soundboard_pages: a player at the same table is not the page''s owner');
select throws_ok(
  $$ select public.reorder_sounds(array['93650000-0000-4000-8000-0000000000a4']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given sounds',
  'reorder_sounds: a player at the same table is not the sound''s owner');

select lives_ok(
  $$ select public.reorder_player_journal_entries(array['93650000-0000-4000-8000-0000000000a2']::uuid[], array[7]) $$,
  'reorder_player_journal_entries: the owner can (positive control)');
select is((select sort_order from public.player_journal_entries where id = '93650000-0000-4000-8000-0000000000a2'), 7,
  'reorder_player_journal_entries: the owner''s call moved the entry');

select pg_temp.as_user(1);
select lives_ok(
  $$ select public.reorder_notes(array['93650000-0000-4000-8000-0000000000a1']::uuid[], array[7]) $$,
  'reorder_notes: the owner can (positive control)');
select lives_ok(
  $$ select public.reorder_soundboard_pages(array['93650000-0000-4000-8000-0000000000a3']::uuid[], array[7]) $$,
  'reorder_soundboard_pages: the owner can (positive control)');
select lives_ok(
  $$ select public.reorder_sounds(array['93650000-0000-4000-8000-0000000000a4']::uuid[], array[7]) $$,
  'reorder_sounds: the owner can (positive control)');

-- ── reorder_party_inventory (members of the item's campaign) ────────────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.reorder_party_inventory(array['93650000-0000-4000-8000-0000000000f1']::uuid[], array[9]) $$,
  'P0001', 'Not authorized to reorder one or more of the given inventory items',
  'reorder_party_inventory: a non-member cannot reorder c1''s party inventory');

select pg_temp.as_user(2);
select lives_ok(
  $$ select public.reorder_party_inventory(array['93650000-0000-4000-8000-0000000000f1']::uuid[], array[7]) $$,
  'reorder_party_inventory: a member of c1 can (positive control)');
select is((select sort_order from public.party_inventory where id = '93650000-0000-4000-8000-0000000000f1'), 7,
  'reorder_party_inventory: the member''s call moved the item');

-- ── resolve_downtime_draw (DM of the draw's own campaign) ───────────────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.resolve_downtime_draw('93650000-0000-4000-8000-0000000000d1', 'Fine', 'A vignette', null, null, '[]'::jsonb, null) $$,
  '42501', 'Only the DM may resolve a downtime draw',
  'resolve_downtime_draw: another campaign''s DM cannot resolve c1''s draw');

select pg_temp.as_user(2);
select throws_ok(
  $$ select public.resolve_downtime_draw('93650000-0000-4000-8000-0000000000d1', 'Fine', 'A vignette', null, null, '[]'::jsonb, null) $$,
  '42501', 'Only the DM may resolve a downtime draw',
  'resolve_downtime_draw: the player who spent the draw cannot resolve their own outcome');

select pg_temp.as_user(1);
select is(
  (public.resolve_downtime_draw('93650000-0000-4000-8000-0000000000d1', 'Fine', 'A vignette', null, null, '[]'::jsonb, null)).title,
  'Fine',
  'resolve_downtime_draw: the DM of c1 can (positive control)');
select is((select status from public.downtime_draws where id = '93650000-0000-4000-8000-0000000000d1'), 'resolved',
  'resolve_downtime_draw: the DM''s call resolved the draw');

-- ── spend_downtime_draw (a character in the named campaign) ─────────────────

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.spend_downtime_draw('93650000-0000-4000-8000-0000000000c1', 'carousing') $$,
  '42501', 'You do not play a character in this campaign',
  'spend_downtime_draw: a non-member cannot spend a draw in c1');

select pg_temp.as_user(1);
select throws_ok(
  $$ select public.spend_downtime_draw('93650000-0000-4000-8000-0000000000c1', 'carousing') $$,
  '42501', 'You do not play a character in this campaign',
  'spend_downtime_draw: a member with no character (the DM) cannot spend one');

select pg_temp.as_user(2);
select is(
  (public.spend_downtime_draw('93650000-0000-4000-8000-0000000000c1', 'training')).party_member_id,
  '93650000-0000-4000-8000-0000000000e1'::uuid,
  'spend_downtime_draw: the player''s character can spend it (positive control)');

select * from finish();
rollback;
