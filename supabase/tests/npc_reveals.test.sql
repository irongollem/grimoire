begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- npc_reveals records the first moment each party member could see each NPC
-- (20261005220422), so the player's People list can sort by "Recently
-- revealed". Both ways an NPC reaches a member are covered (shared directly,
-- shared through its location), plus the two things that must not happen: a
-- later share moving the moment, and anyone reading a row that is not theirs.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('94400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reveal-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reveal-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reveal-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reveal-out@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000010', '94400000-0000-4000-8000-000000000001', 'Reveals'),
  ('94400000-0000-4000-8000-000000000011', '94400000-0000-4000-8000-000000000004', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('94400000-0000-4000-8000-000000000030', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000010', 'Ash', '2014'),
  ('94400000-0000-4000-8000-000000000031', '94400000-0000-4000-8000-000000000003', '94400000-0000-4000-8000-000000000010', 'Birch', '2014'),
  ('94400000-0000-4000-8000-000000000032', '94400000-0000-4000-8000-000000000004', '94400000-0000-4000-8000-000000000011', 'Cedar', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('94400000-0000-4000-8000-000000000010', '94400000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('94400000-0000-4000-8000-000000000010', '94400000-0000-4000-8000-000000000002', 'player', 'A', '94400000-0000-4000-8000-000000000030'),
  ('94400000-0000-4000-8000-000000000010', '94400000-0000-4000-8000-000000000003', 'player', 'B', '94400000-0000-4000-8000-000000000031')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.locations (id, user_id, campaign_id, name) values
  ('94400000-0000-4000-8000-000000000040', '94400000-0000-4000-8000-000000000001', '94400000-0000-4000-8000-000000000010', 'The Inn');

-- Shared with Ash directly; the array also holds Cedar, a member of another
-- campaign, which must not become a row.
insert into public.npcs (id, user_id, campaign_id, name, player_visible_to, player_visible_fields) values
  ('94400000-0000-4000-8000-000000000020', '94400000-0000-4000-8000-000000000001', '94400000-0000-4000-8000-000000000010',
   'Froya', array['94400000-0000-4000-8000-000000000030', '94400000-0000-4000-8000-000000000032']::uuid[], array['name']),
  ('94400000-0000-4000-8000-000000000021', '94400000-0000-4000-8000-000000000001', '94400000-0000-4000-8000-000000000010',
   'Innkeeper', '{}'::uuid[], array['name']),
  ('94400000-0000-4000-8000-000000000022', '94400000-0000-4000-8000-000000000001', '94400000-0000-4000-8000-000000000010',
   'Wanderer', '{}'::uuid[], array['name']);

select is(
  (select array_agg(party_member_id order by party_member_id) from public.npc_reveals
    where npc_id = '94400000-0000-4000-8000-000000000020'),
  array['94400000-0000-4000-8000-000000000030']::uuid[],
  'sharing an NPC directly records a reveal for that member only, not another campaign''s');

select is(
  (select count(*)::integer from public.npc_reveals
    where npc_id in ('94400000-0000-4000-8000-000000000021', '94400000-0000-4000-8000-000000000022')),
  0, 'an NPC shared with nobody has no reveals');

-- Pin the first moment in the past, then unshare and share again.
update public.npc_reveals set revealed_at = '2020-01-01T00:00:00Z'
 where npc_id = '94400000-0000-4000-8000-000000000020';
update public.npcs set player_visible_to = '{}'::uuid[] where id = '94400000-0000-4000-8000-000000000020';
update public.npcs set player_visible_to = array['94400000-0000-4000-8000-000000000030']::uuid[]
 where id = '94400000-0000-4000-8000-000000000020';

select is(
  (select revealed_at from public.npc_reveals
    where npc_id = '94400000-0000-4000-8000-000000000020' and party_member_id = '94400000-0000-4000-8000-000000000030'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'unsharing and sharing again keeps the first moment');

-- The Innkeeper lives at the Inn; the Inn starts sharing its people with Birch.
update public.npcs set location_id = '94400000-0000-4000-8000-000000000040'
 where id = '94400000-0000-4000-8000-000000000021';

select is(
  (select count(*)::integer from public.npc_reveals where npc_id = '94400000-0000-4000-8000-000000000021'),
  0, 'placing an NPC in a location that shares nothing reveals nothing');

update public.locations
   set is_npcs_shared = true, player_visible_to = array['94400000-0000-4000-8000-000000000031']::uuid[]
 where id = '94400000-0000-4000-8000-000000000040';

select is(
  (select array_agg(party_member_id) from public.npc_reveals where npc_id = '94400000-0000-4000-8000-000000000021'),
  array['94400000-0000-4000-8000-000000000031']::uuid[],
  'a location sharing its people reveals the NPCs living there to its members');

update public.npcs set location_id = '94400000-0000-4000-8000-000000000040'
 where id = '94400000-0000-4000-8000-000000000022';

select is(
  (select array_agg(party_member_id) from public.npc_reveals where npc_id = '94400000-0000-4000-8000-000000000022'),
  array['94400000-0000-4000-8000-000000000031']::uuid[],
  'moving an NPC into a location that shares its people reveals them');

-- ── As player A ────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '94400000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select array_agg(npc_id) from public.npc_reveals),
  array['94400000-0000-4000-8000-000000000020']::uuid[],
  'player A reads only their own reveal');

select throws_ok(
  $$ insert into public.npc_reveals (npc_id, party_member_id, campaign_id)
     values ('94400000-0000-4000-8000-000000000021', '94400000-0000-4000-8000-000000000030',
             '94400000-0000-4000-8000-000000000010') $$,
  '42501', null,
  'and cannot record one themselves');

select throws_ok(
  $$ update public.npc_reveals set revealed_at = now() where npc_id = '94400000-0000-4000-8000-000000000020' $$,
  '42501', null,
  'and cannot rewrite when it happened (only session_id is updatable, and only by the DM)');
delete from public.npc_reveals where npc_id = '94400000-0000-4000-8000-000000000020';

-- ── As player B ────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '94400000-0000-4000-8000-000000000003', true);

select is(
  (select count(*)::integer from public.npc_reveals),
  2, 'player B reads their own two reveals, not A''s');

-- ── As an outsider ─────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '94400000-0000-4000-8000-000000000004', true);

select is(
  (select count(*)::integer from public.npc_reveals where campaign_id = '94400000-0000-4000-8000-000000000010'),
  0, 'someone outside the campaign reads none');

-- ── As the DM ──────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '94400000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.npc_reveals where campaign_id = '94400000-0000-4000-8000-000000000010'),
  3, 'the DM reads every reveal in the campaign, so A''s delete removed nothing');

select is(
  (select revealed_at from public.npc_reveals
    where npc_id = '94400000-0000-4000-8000-000000000020' and party_member_id = '94400000-0000-4000-8000-000000000030'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'player A''s attempted update and delete changed nothing');

select * from finish();
rollback;
