begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

-- Cover for the arrival trigger on quest_beat_transitions
-- (private.quest_arrival_visibility), its undo in
-- private.undo_quest_transition_consequences, the objective visibility that
-- follows status, and the removal of the `reveal` ledger verb (#1194).
-- A move writes what players know: the beat the party arrives at becomes
-- revealed, a non-secret hidden beat one route on becomes rumored, a quest
-- shared with nobody is shared with the party, and Undo takes exactly that back.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('11940000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11940000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11940000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system)
values ('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000000001', 'Arrival', 'dnd5e-2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('11940000-0000-4000-8000-000000000020', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000002', '11940000-0000-4000-8000-000000000010', 'Hero 1', '2014'),
  ('11940000-0000-4000-8000-000000000021', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000003', '11940000-0000-4000-8000-000000000010', 'Hero 2', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000000002', 'player', 'Player 1', '11940000-0000-4000-8000-000000000020'),
  ('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000000003', 'player', 'Player 2', '11940000-0000-4000-8000-000000000021');

-- Quest A: shared with nobody. A -> B, A -> C (secret), A -> E (already
-- revealed), A -> G (already rumored), B -> D.
insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest A');
insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, secret) values
  ('11940000-0000-4000-8000-0000000a00b1', '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', 'A', 'hidden', false),
  ('11940000-0000-4000-8000-0000000a00b2', '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', 'B', 'hidden', false),
  ('11940000-0000-4000-8000-0000000a00b3', '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', 'C secret', 'hidden', true),
  ('11940000-0000-4000-8000-0000000a00b4', '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', 'D two on', 'hidden', false),
  ('11940000-0000-4000-8000-0000000a00b5', '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', 'E revealed', 'revealed', false),
  ('11940000-0000-4000-8000-0000000a00b7', '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', 'G rumored', 'rumored', false);
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
select '11940000-0000-4000-8000-0000000a0001', '11940000-0000-4000-8000-000000000010', s, t from (values
  ('11940000-0000-4000-8000-0000000a00b1'::uuid, '11940000-0000-4000-8000-0000000a00b2'::uuid),
  ('11940000-0000-4000-8000-0000000a00b1'::uuid, '11940000-0000-4000-8000-0000000a00b3'::uuid),
  ('11940000-0000-4000-8000-0000000a00b1'::uuid, '11940000-0000-4000-8000-0000000a00b5'::uuid),
  ('11940000-0000-4000-8000-0000000a00b1'::uuid, '11940000-0000-4000-8000-0000000a00b7'::uuid),
  ('11940000-0000-4000-8000-0000000a00b2'::uuid, '11940000-0000-4000-8000-0000000a00b4'::uuid)) v(s, t);

-- Quest B: played with transition_quest_runtime. P -> Q -> R, shared with Hero 1.
insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest B',
   array['11940000-0000-4000-8000-000000000020']::uuid[]);
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000b00b1', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', 'P'),
  ('11940000-0000-4000-8000-0000000b00b2', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', 'Q'),
  ('11940000-0000-4000-8000-0000000b00b3', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', 'R');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('11940000-0000-4000-8000-0000000b00e1', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b00b1', '11940000-0000-4000-8000-0000000b00b2'),
  ('11940000-0000-4000-8000-0000000b00e2', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b00b2', '11940000-0000-4000-8000-0000000b00b3');

-- Quest C: shared with Hero 1, for the hand-change undo. A -> B, A -> C.
insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest C',
   array['11940000-0000-4000-8000-000000000020']::uuid[]);
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000c00b1', '11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', 'A'),
  ('11940000-0000-4000-8000-0000000c00b2', '11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', 'B'),
  ('11940000-0000-4000-8000-0000000c00b3', '11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', 'C');
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000c00b1', '11940000-0000-4000-8000-0000000c00b2'),
  ('11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000c00b1', '11940000-0000-4000-8000-0000000c00b3');

-- Quest D: already shared with Hero 1 only, so a move must leave the share alone.
insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('11940000-0000-4000-8000-0000000d0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest D',
   array['11940000-0000-4000-8000-000000000020']::uuid[]);
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000d00b1', '11940000-0000-4000-8000-0000000d0001', '11940000-0000-4000-8000-000000000010', 'A'),
  ('11940000-0000-4000-8000-0000000d00b2', '11940000-0000-4000-8000-0000000d0001', '11940000-0000-4000-8000-000000000010', 'B');
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
values ('11940000-0000-4000-8000-0000000d0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000d00b1', '11940000-0000-4000-8000-0000000d00b2');

-- Quest E: shared with Hero 1 (not Hero 2). One pending and one dormant
-- objective; arriving at B raises the dormant one.
insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest E',
   array['11940000-0000-4000-8000-000000000020']::uuid[]);
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000e00b1', '11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-000000000010', 'A'),
  ('11940000-0000-4000-8000-0000000e00b2', '11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-000000000010', 'B');
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
values ('11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000e00b1', '11940000-0000-4000-8000-0000000e00b2');
insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('11940000-0000-4000-8000-0000000e0021', '11940000-0000-4000-8000-0000000e0001', 'Known', 'pending', 1),
  ('11940000-0000-4000-8000-0000000e0022', '11940000-0000-4000-8000-0000000e0001', 'Not yet', 'dormant', 2);
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('11940000-0000-4000-8000-0000000e0031', '11940000-0000-4000-8000-0000000e0001',
        '11940000-0000-4000-8000-0000000e00b2', 'raise', '11940000-0000-4000-8000-0000000e0022');

create or replace function pg_temp.main_thread(p_quest uuid) returns uuid language sql as
  $$ select id from public.quest_threads where quest_id = p_quest and label = 'Main' $$;
grant execute on function pg_temp.main_thread(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. mark_quest_move: arriving at A on a quest shared with nobody.
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$select public.mark_quest_move('11940000-0000-4000-8000-000000000010'::uuid, '11940000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11940000-0000-4000-8000-0000000a0001'), 'party_here', p_beat_id => '11940000-0000-4000-8000-0000000a00b1'::uuid)$$,
  'the DM marks the party at A'
);

reset role;

select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b1'), 'revealed',
  'the beat the party arrived at is revealed (fails if arrival leaves it hidden)');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b2'), 'rumored',
  'a hidden beat one route on becomes rumored');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b3'), 'hidden',
  'a secret beat one route on stays hidden (fails if Secret is ignored)');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b4'), 'hidden',
  'a beat two routes on stays hidden (fails if the rumor spreads past one route)');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b5'), 'revealed',
  'a beat already revealed is never lowered to rumored');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b7'), 'rumored',
  'a beat already rumored stays rumored');

select is(
  (select jsonb_array_length(visibility_changes) from public.quest_beat_transitions
    where to_beat_id = '11940000-0000-4000-8000-0000000a00b1'),
  2, 'the transition lists exactly the two beats that changed (not the secret, the revealed or the rumored ones)'
);
select ok(
  (select visibility_changes @> '[{"beat_id":"11940000-0000-4000-8000-0000000a00b1","from":"hidden","to":"revealed"}]'::jsonb
      and visibility_changes @> '[{"beat_id":"11940000-0000-4000-8000-0000000a00b2","from":"hidden","to":"rumored"}]'::jsonb
     from public.quest_beat_transitions where to_beat_id = '11940000-0000-4000-8000-0000000a00b1'),
  'visibility_changes records each beat with its previous and new visibility'
);

-- Auto-share.
select is(
  (select array(select unnest(player_visible_to) order by 1) from public.quests where id = '11940000-0000-4000-8000-0000000a0001'),
  array['11940000-0000-4000-8000-000000000020', '11940000-0000-4000-8000-000000000021']::uuid[],
  'a quest shared with nobody is shared with every party member on the first move that shows players something'
);
select is(
  (select count(*)::integer from public.campaign_messages
    where campaign_id = '11940000-0000-4000-8000-000000000010' and metadata ->> 'entity_id' = '11940000-0000-4000-8000-0000000a0001'
      and message like '%Quest shared%'),
  1, 'the share is announced once'
);
select is(
  (select cardinality(shared_with) from public.quest_beat_transitions where to_beat_id = '11940000-0000-4000-8000-0000000a00b1'),
  2, 'the transition remembers which members it added, so Undo can take only those back'
);

-- Undo.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$select public.undo_quest_move('11940000-0000-4000-8000-000000000010'::uuid, '11940000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11940000-0000-4000-8000-0000000a0001'))$$,
  'the DM undoes the move'
);
reset role;

select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b1'), 'hidden',
  'undo puts the arrived beat back to hidden');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b2'), 'hidden',
  'undo puts the rumored beat back to hidden');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b5'), 'revealed',
  'undo leaves a beat the move never touched as it was');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000a00b7'), 'rumored',
  'undo does not hide a beat that was already rumored before the move');
select is((select cardinality(player_visible_to) from public.quests where id = '11940000-0000-4000-8000-0000000a0001'), 0,
  'undo removes the members the move added');
select is(
  (select count(*)::integer from public.campaign_messages
    where metadata ->> 'entity_id' = '11940000-0000-4000-8000-0000000a0001' and message like '%Quest shared%'),
  0, 'undo deletes the announcement'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. transition_quest_runtime: start at P, then advance P -> Q.
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$select public.transition_quest_runtime('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b0001',
      pg_temp.main_thread('11940000-0000-4000-8000-0000000b0001'), 'start', 0, '11940000-0000-4000-8000-0000000b00b1')$$,
  'starting at P'
);
reset role;
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b1'), 'revealed',
  'starting at a beat reveals it');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b2'), 'rumored',
  'starting at a beat rumors the one a route away');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b3'), 'hidden',
  'and not the one two routes away');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$select public.transition_quest_runtime('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b0001',
      pg_temp.main_thread('11940000-0000-4000-8000-0000000b0001'), 'advance', 1, p_edge_id => '11940000-0000-4000-8000-0000000b00e1')$$,
  'advancing P -> Q'
);
reset role;
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b2'), 'revealed',
  'advancing reveals the beat arrived at, lifting it from rumored');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b3'), 'rumored',
  'advancing rumors the next beat on');
select is(
  (select jsonb_array_length(visibility_changes) from public.quest_beat_transitions
    where to_beat_id = '11940000-0000-4000-8000-0000000b00b2' and transition_kind <> 'assert'
      and from_beat_id = '11940000-0000-4000-8000-0000000b00b1'),
  2, 'the advance records Q rumored->revealed and R hidden->rumored, and nothing else'
);

-- Stepping back restores them (transition_quest_runtime 'previous').
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$select public.transition_quest_runtime('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b0001',
      pg_temp.main_thread('11940000-0000-4000-8000-0000000b0001'), 'previous', 2)$$,
  'stepping back from Q'
);
reset role;
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b3'), 'hidden',
  'stepping back takes the next beat''s rumor away again');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000b00b2'), 'rumored',
  'and puts Q back to rumored, where it was before the advance');
select is(
  (select visibility_changes from public.quest_beat_transitions
    where to_beat_id = '11940000-0000-4000-8000-0000000b00b2' and transition_kind <> 'assert'
      and from_beat_id = '11940000-0000-4000-8000-0000000b00b1'),
  '[]'::jsonb, 'the undone arrival forgets what it changed, so a second step back cannot re-apply it'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Undo leaves a hand change alone (quest C), with its positive control.
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select public.mark_quest_move('11940000-0000-4000-8000-000000000010'::uuid, '11940000-0000-4000-8000-0000000c0001'::uuid,
  pg_temp.main_thread('11940000-0000-4000-8000-0000000c0001'), 'party_here', p_beat_id => '11940000-0000-4000-8000-0000000c00b1'::uuid);
reset role;
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000c00b2'), 'rumored', 'precondition: the move rumored B');
update public.quest_beats set visibility = 'revealed' where id = '11940000-0000-4000-8000-0000000c00b2';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select public.undo_quest_move('11940000-0000-4000-8000-000000000010'::uuid, '11940000-0000-4000-8000-0000000c0001'::uuid,
  pg_temp.main_thread('11940000-0000-4000-8000-0000000c0001'));
reset role;
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000c00b2'), 'revealed',
  'undo leaves a beat the DM revealed by hand after the move (fails if undo restores blindly)');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000c00b3'), 'hidden',
  'positive control: the same undo restores the beat the DM did not touch');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000c00b1'), 'hidden',
  'positive control: and the arrived beat');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. A quest already shared with one member is left as it was (quest D).
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select public.mark_quest_move('11940000-0000-4000-8000-000000000010'::uuid, '11940000-0000-4000-8000-0000000d0001'::uuid,
  pg_temp.main_thread('11940000-0000-4000-8000-0000000d0001'), 'party_here', p_beat_id => '11940000-0000-4000-8000-0000000d00b1'::uuid);
reset role;
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000000d00b2'), 'rumored',
  'precondition: the move did change visibility');
select is((select player_visible_to from public.quests where id = '11940000-0000-4000-8000-0000000d0001'),
  array['11940000-0000-4000-8000-000000000020']::uuid[], 'a partial share is not widened');
select is(
  (select count(*)::integer from public.campaign_messages where metadata ->> 'entity_id' = '11940000-0000-4000-8000-0000000d0001'),
  0, 'and nothing is announced'
);
select ok(
  (select bool_and(shared_with is null) from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000d0001'),
  'the transition records no members, so Undo has none to remove'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Objectives follow their status (quest E).
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select array_agg(description order by description) from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  array['Known'], 'a player of the quest reads the pending objective and not the dormant one'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  0, 'a player the quest is not shared with reads neither'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  2, 'the DM reads both'
);

-- Raise: arriving at B raises the dormant objective, and the player can now read it.
select public.mark_quest_move('11940000-0000-4000-8000-000000000010'::uuid, '11940000-0000-4000-8000-0000000e0001'::uuid,
  pg_temp.main_thread('11940000-0000-4000-8000-0000000e0001'), 'party_here', p_beat_id => '11940000-0000-4000-8000-0000000e00b2'::uuid);
select is((select status from public.quest_objectives where id = '11940000-0000-4000-8000-0000000e0022'), 'pending',
  'a raise rule moves the dormant objective to pending on arrival');
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  2, 'and the player can now read it'
);
reset role;

-- The reveal verb is gone.
select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_objective_id)
    values ('11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-0000000e00b1', 'reveal', '11940000-0000-4000-8000-0000000e0021')$$,
  '23514', null, 'the reveal verb is rejected by the check constraint'
);

select * from finish();
rollback;
