-- "Story so far" must follow the story, not the DM's clicking order. The reveal
-- switch writes `updated_at`, so ordering by it made the player recap contradict
-- the sequence the party actually played through.
begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('65900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storyorder-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('65900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storyorder-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000001', 'Story order');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('65900000-0000-4000-8000-000000000020', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000002', '65900000-0000-4000-8000-000000000010', 'Sable');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id)
values ('65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000002', 'player', 'Sable', '65900000-0000-4000-8000-000000000020');

insert into public.quests (id, user_id, campaign_id, title, status, player_visible_to)
values ('65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', 'The long road', 'active', array['65900000-0000-4000-8000-000000000020']::uuid[]);

-- A -> B -> C, revealed in the order C, A, B — the sequence a DM produces when
-- catching the log up after a session rather than during one.
insert into public.quest_beats (id, quest_id, campaign_id, title, reveal_text, visibility, kind, canvas_x, updated_at) values
  ('65900000-0000-4000-8000-000000000041', '65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', 'A', 'First the gate', 'revealed', 'social', 0, '2026-08-10T15:00:00Z'),
  ('65900000-0000-4000-8000-000000000042', '65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', 'B', 'Then the bridge', 'revealed', 'explore', 320, '2026-08-10T16:00:00Z'),
  ('65900000-0000-4000-8000-000000000043', '65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', 'C', 'Last the keep', 'revealed', 'combat', 640, '2026-08-10T14:00:00Z');

insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000041', '65900000-0000-4000-8000-000000000042', 'Continue'),
  ('65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000042', '65900000-0000-4000-8000-000000000043', 'Continue');

select set_config('request.jwt.claim.sub', '65900000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (select array_agg(player_text order by story_order) from public.get_player_visible_quest_beats('65900000-0000-4000-8000-000000000010')),
  array['First the gate', 'Then the bridge', 'Last the keep'],
  'the recap follows the authored flow, not the order the DM flipped the switches'
);

select is(
  (select story_order from public.get_player_visible_quest_beats('65900000-0000-4000-8000-000000000010') where id = '65900000-0000-4000-8000-000000000043'),
  2,
  'depth counts steps from the opening beat'
);

select set_config('request.jwt.claim.sub', '65900000-0000-4000-8000-000000000001', true);
set local role postgres;

-- A loop back is valid authored structure. Depth must still terminate, and the
-- beat keeps its longest-path position rather than collapsing onto the opening.
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000043', '65900000-0000-4000-8000-000000000042', 'Loop back');

select set_config('request.jwt.claim.sub', '65900000-0000-4000-8000-000000000002', true);
set local role authenticated;

select lives_ok(
  $$select * from public.get_player_visible_quest_beats('65900000-0000-4000-8000-000000000010')$$,
  'a cycle in the flow does not stall the depth walk'
);

select is(
  (select story_order from public.get_player_visible_quest_beats('65900000-0000-4000-8000-000000000010') where id = '65900000-0000-4000-8000-000000000042'),
  1,
  'a beat reachable by two paths takes its longest-path position'
);

-- The rank is a position, never a map: it must not tell a player that branches
-- exist, where they lead, or that a hidden beat sits between two revealed ones.
select ok(
  (select not (to_jsonb(b) ?| array['edges', 'source_beat_id', 'target_beat_id', 'title'])
   from public.get_player_visible_quest_beats('65900000-0000-4000-8000-000000000010') b limit 1),
  'the projection still exposes no edge or DM-authored fields'
);

select * from finish();
rollback;
