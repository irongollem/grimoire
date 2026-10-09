begin;
-- This file reads the doorbell's rings (realtime.messages) inside its own
-- transaction. The rings are sent at commit (20261009233206), so drain the queue
-- per statement instead. Rings are read as a set ("a ring for X was sent"):
-- inserted_at is constant inside a transaction, so their order cannot be read.
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- A player reads an NPC only through get_player_visible_npcs (20260928233302).
--
-- `npcs_player_select` used to hand a player the whole row of every NPC shared
-- with their character: a disguised NPC's true name, a name the DM had not
-- shared, the backstory and the DM's notes. The projection withheld all of it;
-- the table did not. This file pins both halves: the table gives a player
-- nothing, and the projection still gives them exactly what they may know. It
-- also covers the two things that used to lean on the policy, the rating
-- checks and the doorbell, so neither passes by denying everyone.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('93300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'npcw-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('93300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'npcw-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('93300000-0000-4000-8000-000000000010', '93300000-0000-4000-8000-000000000001', 'Withheld names');

insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('93300000-0000-4000-8000-000000000030', '93300000-0000-4000-8000-000000000002', '93300000-0000-4000-8000-000000000010', 'Nessa', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93300000-0000-4000-8000-000000000010', '93300000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('93300000-0000-4000-8000-000000000010', '93300000-0000-4000-8000-000000000002', 'player', 'The player', '93300000-0000-4000-8000-000000000030')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- Three NPCs shared with Nessa: one disguised, one whose name is not shared,
-- one plainly known. A fourth is not shared at all.
insert into public.npcs (id, user_id, campaign_id, name, disguise_name, is_revealed, player_visible_to, player_visible_fields, backstory, notes) values
  ('93300000-0000-4000-8000-000000000020', '93300000-0000-4000-8000-000000000001', '93300000-0000-4000-8000-000000000010',
   'Vesper the Lich', 'Mara the Innkeeper', false, array['93300000-0000-4000-8000-000000000030']::uuid[], array['name', 'portrait'], 'Secret backstory', 'DM notes'),
  ('93300000-0000-4000-8000-000000000021', '93300000-0000-4000-8000-000000000001', '93300000-0000-4000-8000-000000000010',
   'The Hooded Man', null, true, array['93300000-0000-4000-8000-000000000030']::uuid[], array['portrait'], null, null),
  ('93300000-0000-4000-8000-000000000022', '93300000-0000-4000-8000-000000000001', '93300000-0000-4000-8000-000000000010',
   'Froya', null, true, array['93300000-0000-4000-8000-000000000030']::uuid[], array['name'], null, null),
  ('93300000-0000-4000-8000-000000000023', '93300000-0000-4000-8000-000000000001', '93300000-0000-4000-8000-000000000010',
   'Unmet stranger', null, true, '{}'::uuid[], array['name'], null, null);

-- ── As the player ──────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '93300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.npcs where campaign_id = '93300000-0000-4000-8000-000000000010'),
  0, 'a player selects no npcs rows, even the three shared with them');

select is(
  (select count(*)::integer from public.get_player_visible_npcs('93300000-0000-4000-8000-000000000010')),
  3, 'the projection still returns the three NPCs shared with them');

select is(
  (select name from public.get_player_visible_npcs('93300000-0000-4000-8000-000000000010')
    where id = '93300000-0000-4000-8000-000000000020'),
  'Mara the Innkeeper', 'a disguised NPC comes back under its cover name');

select is(
  (select name from public.get_player_visible_npcs('93300000-0000-4000-8000-000000000010')
    where id = '93300000-0000-4000-8000-000000000021'),
  null, 'an NPC whose name is not shared comes back nameless');

select is(
  (select count(*)::integer from public.get_player_visible_npcs('93300000-0000-4000-8000-000000000010')
    where name = 'Vesper the Lich' or backstory is not null or notes is not null),
  0, 'and the true name, backstory and DM notes never come back at all');

select is(
  private.npc_is_visible_to_caller('93300000-0000-4000-8000-000000000023', '93300000-0000-4000-8000-000000000010'),
  false, 'the rating helper answers false, not null, for an NPC not shared with them');

select lives_ok(
  $$ insert into public.player_npc_ratings (user_id, campaign_id, npc_id, rating)
     values ('93300000-0000-4000-8000-000000000002', '93300000-0000-4000-8000-000000000010',
             '93300000-0000-4000-8000-000000000022', 4) $$,
  'they can still rate an NPC shared with them');

select lives_ok(
  $$ update public.player_npc_ratings set rating = 5
      where npc_id = '93300000-0000-4000-8000-000000000022' $$,
  'and change that rating');

select throws_ok(
  $$ insert into public.player_npc_ratings (user_id, campaign_id, npc_id, rating)
     values ('93300000-0000-4000-8000-000000000002', '93300000-0000-4000-8000-000000000010',
             '93300000-0000-4000-8000-000000000023', 3) $$,
  '42501', null,
  'but not one that was never shared with them');

-- ── As the DM, so none of the above passes by denying everyone ─────────────

select set_config('request.jwt.claim.sub', '93300000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.npcs where campaign_id = '93300000-0000-4000-8000-000000000010'),
  4, 'the DM still reads every NPC row');

-- realtime.messages is not readable by a client, so read the rings as the owner.
reset role;

-- The doorbell: an edit rings `npcs_player`, so players re-read their
-- projection; a delete still rings `npcs`.
delete from realtime.messages where topic = 'doorbell:93300000-0000-4000-8000-000000000010';
update public.npcs set is_revealed = true where id = '93300000-0000-4000-8000-000000000020';

select ok(
  exists (select 1 from realtime.messages where topic = 'doorbell:93300000-0000-4000-8000-000000000010' and event = 'ring' and extension = 'broadcast' and payload ->> 'table' = 'npcs_player'),
  'an NPC edit rings the npcs_player signal');

delete from realtime.messages where topic = 'doorbell:93300000-0000-4000-8000-000000000010';
delete from public.npcs where id = '93300000-0000-4000-8000-000000000023';

select ok(
  exists (select 1 from realtime.messages where topic = 'doorbell:93300000-0000-4000-8000-000000000010' and event = 'ring' and extension = 'broadcast' and payload ->> 'table' = 'npcs'),
  'an NPC delete still rings as npcs');

select * from finish();
rollback;
