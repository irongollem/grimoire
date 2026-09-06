-- #798: the player journal (objectives filtered to raised-and-revealed) and the
-- filling-in site map (only explored rooms leave the database).

begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function('public', 'get_player_visible_site_state', array['uuid', 'uuid'],
  'the inside of a site reaches players through a dedicated projection');
select ok(not has_function_privilege('anon', 'public.get_player_visible_site_state(uuid,uuid)', 'EXECUTE'),
  'anonymous callers cannot execute the site projection');
select ok(position('staged_at_location_id' in pg_get_functiondef('public.get_player_visible_quest_beats(uuid,uuid,uuid)'::regprocedure)) > 0,
  'the player beats projection carries the place a beat stages at, so the map can follow the story');
select ok(position('location_set' in pg_get_functiondef('public.get_player_visible_quest_beats(uuid,uuid,uuid)'::regprocedure)) = 0,
  'and no longer carries an arm for the attachment type #797 deleted');

-- ── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('79800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue798-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('79800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue798-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('79800000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue798-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79800000-0000-4000-8000-000000000010', '79800000-0000-4000-8000-000000000001', 'Journal campaign');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('79800000-0000-4000-8000-000000000020', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000002', '79800000-0000-4000-8000-000000000010', 'Nessa');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('79800000-0000-4000-8000-000000000010', '79800000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('79800000-0000-4000-8000-000000000010', '79800000-0000-4000-8000-000000000002', 'player', 'Player', '79800000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.quests (id, user_id, campaign_id, title, player_visible_to)
values ('79800000-0000-4000-8000-000000000030', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000010', 'The Sunken Courtyard', array['79800000-0000-4000-8000-000000000020']::uuid[]);

-- Three revealed statuses, plus a dormant branch. Dormant is inserted HIDDEN
-- because #792's CHECK makes dormant-and-visible unstorable — which is the
-- protection, and is asserted directly below.
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values
  ('79800000-0000-4000-8000-000000000040', '79800000-0000-4000-8000-000000000030', 'Find the rider',   'pending',  true),
  ('79800000-0000-4000-8000-000000000041', '79800000-0000-4000-8000-000000000030', 'Reach the gate',   'complete', true),
  ('79800000-0000-4000-8000-000000000042', '79800000-0000-4000-8000-000000000030', 'Save the princess','failed',   true),
  ('79800000-0000-4000-8000-000000000043', '79800000-0000-4000-8000-000000000030', 'Avenge Sildar',    'dormant',  false);

-- The invariant the player journal leans on, pinned at its source. Without
-- this, `quest_objectives_player_select` would happily serve an untaken branch,
-- because that policy never mentions status.
select throws_ok($$
  insert into public.quest_objectives (quest_id, description, status, is_player_visible)
  values ('79800000-0000-4000-8000-000000000030', 'A branch nobody took', 'dormant', true)
$$, '23514', null,
  'a dormant objective cannot be marked player-visible in the first place');

-- A site with two rooms; one explored, one not.
insert into public.locations (id, user_id, campaign_id, name, location_type, map_url, is_map_shared, player_visible_to) values
  ('79800000-0000-4000-8000-000000000050', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000010', 'Caldron Caves', 'dungeon', 'https://example.invalid/map.webp', true, array['79800000-0000-4000-8000-000000000020']::uuid[]);
insert into public.locations (id, user_id, campaign_id, name, location_type, parent_id) values
  ('79800000-0000-4000-8000-000000000051', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000010', 'Sunken courtyard', 'room', '79800000-0000-4000-8000-000000000050'),
  ('79800000-0000-4000-8000-000000000052', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000010', 'The vault',        'room', '79800000-0000-4000-8000-000000000050');

insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells, label, sort_order) values
  ('79800000-0000-4000-8000-000000000060', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000050', '79800000-0000-4000-8000-000000000051', '["0,0","0,1"]'::jsonb, 'Courtyard', 1),
  ('79800000-0000-4000-8000-000000000061', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000050', '79800000-0000-4000-8000-000000000052', '["5,5"]'::jsonb, 'Vault', 2);

-- The courtyard is explored and looted; the vault is untouched.
insert into public.location_state_events (user_id, location_id, fact, value) values
  ('79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000051', 'explored', true),
  ('79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000051', 'looted',   true);

-- ── The journal: raised and revealed only ───────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"79800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '79800000-0000-4000-8000-000000000030'),
  3,
  'a player sees the pending, complete and failed objectives — three of the four'
);

select is(
  (select count(*)::integer from public.quest_objectives
    where quest_id = '79800000-0000-4000-8000-000000000030' and status = 'dormant'),
  0,
  'a dormant objective is an untaken branch and never reaches the party'
);

select is(
  (select count(*)::integer from public.quest_objectives
    where quest_id = '79800000-0000-4000-8000-000000000030' and status = 'failed'),
  1,
  'a failed objective stays visible — "we lost that one" is worth remembering'
);

-- ── The map: explored rooms only ────────────────────────────────────────────

select is(
  (select count(*)::integer from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')),
  1,
  'only the explored room comes back'
);

select is(
  (select space_location_id from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')),
  '79800000-0000-4000-8000-000000000051'::uuid,
  'and it is the courtyard, not the vault'
);

select is(
  (select cells from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')),
  '["0,0","0,1"]'::jsonb,
  'the region geometry travels with it, so the map can draw the shape'
);

select is(
  (select is_looted from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')),
  true,
  'facts the party established themselves come back alongside'
);

select ok(
  not exists (
    select 1 from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')
     where space_location_id = '79800000-0000-4000-8000-000000000052'
  ),
  'the unexplored vault is ABSENT from the payload, not flagged in it — a room '
  'withheld on the client would sit in the network tab'
);

-- ── A region may not straddle two campaigns ────────────────────────────────
--
-- Found by exploit during the #798 audit, not by design review. Nothing in the
-- schema ties a region's space to its site's campaign: the region guard checks
-- parent_id, the room guard checks the parent's type, and neither RLS policy
-- relates a child's campaign to its parent's. So a DM running two tables can
-- reparent a campaign-B room under a campaign-A site with two ordinary writes
-- and hand B's secrets to A's players.

reset role;

insert into public.campaigns (id, user_id, name)
values ('79800000-0000-4000-8000-000000000011', '79800000-0000-4000-8000-000000000001', 'The other table');

-- A room belonging to the OTHER campaign, parented under THIS campaign's site.
-- Both writes pass every existing trigger: the site can hold rooms, and the
-- region's space really is a child of the site.
insert into public.locations (id, user_id, campaign_id, name, location_type, parent_id)
values ('79800000-0000-4000-8000-000000000053', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000011', 'The lich phylactery', 'room', '79800000-0000-4000-8000-000000000050');

insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells, label, sort_order)
values ('79800000-0000-4000-8000-000000000062', '79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000050', '79800000-0000-4000-8000-000000000053', '["9,9"]'::jsonb, 'Phylactery', 3);

insert into public.location_state_events (user_id, location_id, fact, value)
values ('79800000-0000-4000-8000-000000000001', '79800000-0000-4000-8000-000000000053', 'explored', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"79800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select ok(
  not exists (
    select 1 from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')
     where space_location_id = '79800000-0000-4000-8000-000000000053'
  ),
  'a room belonging to another campaign never reaches this campaign''s players, '
  'however it came to be parented under their site'
);

-- ── Who may ask ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"79800000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')),
  0,
  'someone outside the campaign gets nothing at all'
);

reset role;
update public.locations set is_map_shared = false where id = '79800000-0000-4000-8000-000000000050';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"79800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.get_player_visible_site_state('79800000-0000-4000-8000-000000000050')),
  0,
  'an unshared map withholds its geometry too — coordinates are a floor plan'
);

-- ── DM preview ──────────────────────────────────────────────────────────────
--
-- Without this the DM cannot see what the journal shows, because a DM's own
-- campaign_members row has a null party_member_id and matches nothing in
-- player_visible_to — the feature would be unpreviewable by the one person able
-- to change what it reveals.

reset role;
update public.locations set is_map_shared = true where id = '79800000-0000-4000-8000-000000000050';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"79800000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.get_player_visible_site_state(
     '79800000-0000-4000-8000-000000000050', '79800000-0000-4000-8000-000000000020')),
  1,
  'the DM can preview exactly what a given character sees'
);

select set_config('request.jwt.claims', '{"sub":"79800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.get_player_visible_site_state(
     '79800000-0000-4000-8000-000000000050', '79800000-0000-4000-8000-000000000020')),
  0,
  'a player cannot use the preview argument to read as somebody else'
);

reset role;
select * from finish();
rollback;
