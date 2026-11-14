begin;

create extension if not exists pgtap with schema extensions;
select plan(82);

-- Cover for the arrival trigger on quest_beat_transitions
-- (private.quest_arrival_visibility), its undo in
-- private.undo_quest_transition_consequences, the objective visibility that
-- follows the quest showing a beat, the removal of the `reveal` ledger verb,
-- and the rule that a quest is visible when one of its beats is (#1194).
-- A move writes what players know: the beat the party arrives at becomes
-- revealed, a non-secret hidden beat one route on becomes rumored, and Undo
-- takes exactly that back. Nothing is shared per member any more: the quest
-- shows to the whole party through its beats.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('11940000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11940000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11940000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11940000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrive1194-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

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

-- Quest A: every beat hidden. A -> B, A -> C (secret), A -> E (already
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

-- Quest B: played with transition_quest_runtime. P -> Q -> R.
insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest B');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000b00b1', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', 'P'),
  ('11940000-0000-4000-8000-0000000b00b2', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', 'Q'),
  ('11940000-0000-4000-8000-0000000b00b3', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', 'R');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('11940000-0000-4000-8000-0000000b00e1', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b00b1', '11940000-0000-4000-8000-0000000b00b2'),
  ('11940000-0000-4000-8000-0000000b00e2', '11940000-0000-4000-8000-0000000b0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000b00b2', '11940000-0000-4000-8000-0000000b00b3');

-- Quest C: for the hand-change undo. A -> B, A -> C.
insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest C');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000c00b1', '11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', 'A'),
  ('11940000-0000-4000-8000-0000000c00b2', '11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', 'B'),
  ('11940000-0000-4000-8000-0000000c00b3', '11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', 'C');
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000c00b1', '11940000-0000-4000-8000-0000000c00b2'),
  ('11940000-0000-4000-8000-0000000c0001', '11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000c00b1', '11940000-0000-4000-8000-0000000c00b3');

-- Quest E: every beat hidden. One pending and one dormant objective;
-- arriving at B raises the dormant one.
insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest E');
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
-- 1. mark_quest_move: arriving at A on a quest that shows nothing yet.
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
select is(
  (select count(*)::integer from public.campaign_messages
    where metadata ->> 'entity_id' = '11940000-0000-4000-8000-0000000b0001' and message like '%Quest shared%'),
  1, 'the start that first shows the quest announces it exactly once, not once per beat it changed (P and Q both left hidden)'
);

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
-- 5. Objectives follow the quest showing a beat (quest E).
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  0, 'a player reads no objective while every beat of the quest is hidden (fails if objectives ignore beat visibility)'
);
reset role;
update public.quest_beats set visibility = 'rumored' where id = '11940000-0000-4000-8000-0000000e00b1';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select array_agg(description order by description) from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  array['Known'], 'once a beat is rumored the player reads the pending objective and not the dormant one'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  1, 'and so does every other seated player: it is the quest that shows, not a member'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-0000000e0001'),
  0, 'a user outside the campaign reads none, with the shown quest as the positive control above'
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

-- ════════════════════════════════════════════════════════════════════════════
-- 6. A quest is visible when one of its beats is (quest V).
-- ════════════════════════════════════════════════════════════════════════════

insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000f0001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest V');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000f00b1', '11940000-0000-4000-8000-0000000f0001', '11940000-0000-4000-8000-000000000010', 'V1'),
  ('11940000-0000-4000-8000-0000000f00b2', '11940000-0000-4000-8000-0000000f0001', '11940000-0000-4000-8000-000000000010', 'V2');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is_empty(
  $$select id from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000f0001')$$,
  'a seated player does not see a quest whose beats are all hidden (fails if a quest is visible by status or existence)'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.quests where id = '11940000-0000-4000-8000-0000000f0001'),
  1, 'the DM reads the quest whatever its beats show'
);
select is_empty(
  $$select id from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000f0001',
      '11940000-0000-4000-8000-000000000020')$$,
  'and the preview as a hero shows what that hero would see: nothing while every beat is hidden'
);
reset role;

update public.quest_beats set visibility = 'rumored' where id = '11940000-0000-4000-8000-0000000f00b1';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000f0001')),
  1, 'one rumored beat shows the quest to a seated player'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000f0001')),
  1, 'and shows it to every other seated player too'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
select is_empty(
  $$select id from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000f0001')$$,
  'a user outside the campaign never sees it, however many beats show'
);
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-0000000f0001',
      '11940000-0000-4000-8000-000000000020')),
  1, 'the DM''s preview as a hero now shows the quest'
);
reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Going Active rumors the entry beat (quests F, G, H).
-- ════════════════════════════════════════════════════════════════════════════

insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-000000100001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest F'),
  ('11940000-0000-4000-8000-000000110001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest G'),
  ('11940000-0000-4000-8000-000000120001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest H');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000001000b1', '11940000-0000-4000-8000-000000100001', '11940000-0000-4000-8000-000000000010', 'F entry'),
  ('11940000-0000-4000-8000-0000001000b2', '11940000-0000-4000-8000-000000100001', '11940000-0000-4000-8000-000000000010', 'F other'),
  ('11940000-0000-4000-8000-0000001100b1', '11940000-0000-4000-8000-000000110001', '11940000-0000-4000-8000-000000000010', 'G entry'),
  ('11940000-0000-4000-8000-0000001200b1', '11940000-0000-4000-8000-000000120001', '11940000-0000-4000-8000-000000000010', 'H first'),
  ('11940000-0000-4000-8000-0000001200b2', '11940000-0000-4000-8000-000000120001', '11940000-0000-4000-8000-000000000010', 'H second');
update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000001000b1' where id = '11940000-0000-4000-8000-000000100001';
update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000001100b1' where id = '11940000-0000-4000-8000-000000110001';
update public.quests set status = 'active', entry_beat_id = '11940000-0000-4000-8000-0000001200b1' where id = '11940000-0000-4000-8000-000000120001';

select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001000b1'), 'hidden',
  'precondition: naming the entry beat of an undiscovered quest shows nothing');

update public.quests set status = 'active' where id = '11940000-0000-4000-8000-000000100001';
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001000b1'), 'rumored',
  'moving a quest to active rumors its hidden entry beat (fails if only the board does it, not the status change)');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001000b2'), 'hidden',
  'and only the entry beat, not the rest of the quest');

update public.quests set status = 'completed' where id = '11940000-0000-4000-8000-000000110001';
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001100b1'), 'hidden',
  'a status change that is not to active rumors nothing');

select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001200b1'), 'rumored',
  'an active quest given an entry beat on the same write rumors it');
update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000001200b2' where id = '11940000-0000-4000-8000-000000120001';
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001200b2'), 'rumored',
  'a quest already active whose entry beat changes rumors the new entry (fails if only a status change fires it)');

update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000001100b1' where id = '11940000-0000-4000-8000-000000110001';
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001100b1'), 'hidden',
  'naming an entry beat on a quest that is not active rumors nothing');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. The first beat to leave hidden announces the quest, once (quest M).
-- ════════════════════════════════════════════════════════════════════════════

insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-000000130001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest M');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000001300b1', '11940000-0000-4000-8000-000000130001', '11940000-0000-4000-8000-000000000010', 'M1'),
  ('11940000-0000-4000-8000-0000001300b2', '11940000-0000-4000-8000-000000130001', '11940000-0000-4000-8000-000000000010', 'M2');

create or replace function pg_temp.shared_messages(p_quest uuid) returns integer language sql as
  $$ select count(*)::integer from public.campaign_messages
      where metadata ->> 'entity_id' = p_quest::text and message like '%Quest shared%' $$;

select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000130001'), 0, 'precondition: a quest with every beat hidden announces nothing');
update public.quest_beats set visibility = 'rumored' where id = '11940000-0000-4000-8000-0000001300b1';
select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000130001'), 1, 'the first beat to leave hidden posts one Quest shared message');
select is(
  (select message from public.campaign_messages where metadata ->> 'entity_id' = '11940000-0000-4000-8000-000000130001' and message like '%Quest shared%'),
  '📋 Quest shared: "Quest M"', 'which names the quest');
update public.quest_beats set visibility = 'revealed' where id = '11940000-0000-4000-8000-0000001300b2';
select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000130001'), 1, 'a second beat leaving hidden posts nothing (fails if every beat announces)');
update public.quest_beats set visibility = 'revealed' where id = '11940000-0000-4000-8000-0000001300b1';
select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000130001'), 1, 'a rumor lifted to revealed posts nothing');
update public.quest_beats set visibility = 'hidden' where id = '11940000-0000-4000-8000-0000001300b1';
update public.quest_beats set visibility = 'rumored' where id = '11940000-0000-4000-8000-0000001300b1';
select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000130001'), 1,
  'a beat going hidden and back while another still shows the quest posts nothing (fails if the check ignores the other beats)');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. private.reveal_quest, what a handout or notice does to a quest.
-- (The notice-board and handout paths are exercised end to end in
-- notice_boards.test.sql and handout_sharing.test.sql.)
-- ════════════════════════════════════════════════════════════════════════════

insert into public.campaigns (id, user_id, name, game_system)
values ('11940000-0000-4000-8000-000000000011', '11940000-0000-4000-8000-000000000001', 'Elsewhere', 'dnd5e-2014');
insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-000000140001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest R');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000001400b1', '11940000-0000-4000-8000-000000140001', '11940000-0000-4000-8000-000000000010', 'R entry'),
  ('11940000-0000-4000-8000-0000001400b2', '11940000-0000-4000-8000-000000140001', '11940000-0000-4000-8000-000000000010', 'R later');
update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000001400b1' where id = '11940000-0000-4000-8000-000000140001';

select private.reveal_quest('11940000-0000-4000-8000-000000000011', '11940000-0000-4000-8000-000000140001', null);
select is((select status::text from public.quests where id = '11940000-0000-4000-8000-000000140001'), 'undiscovered',
  'revealing through another campaign does nothing (fails if the campaign is not checked)');
select private.reveal_quest('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000140001', null);
select is((select status::text from public.quests where id = '11940000-0000-4000-8000-000000140001'), 'active',
  'positive control: an undiscovered quest becomes active');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001400b1'), 'rumored',
  'and its entry beat is rumored, which shows the quest');
select is((select visible_to from public.quest_beats where id = '11940000-0000-4000-8000-0000001400b1'), null,
  'to the whole party when no members are named (a notice pin)');
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001400b2'), 'hidden',
  'and nothing else of it');
update public.quest_beats set visibility = 'revealed' where id = '11940000-0000-4000-8000-0000001400b1';
select private.reveal_quest('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000140001', null);
select is((select visibility from public.quest_beats where id = '11940000-0000-4000-8000-0000001400b1'), 'revealed',
  'revealing again never lowers a revealed entry beat to a rumor');

-- ════════════════════════════════════════════════════════════════════════════
-- 10. A beat shown to part of the party shows the quest to that part (quest P).
-- Hero 1 = member ...20 (player 2), Hero 2 = member ...21 (player 3).
-- ════════════════════════════════════════════════════════════════════════════

insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-000000150001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest P');
insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, visible_to) values
  ('11940000-0000-4000-8000-0000001500b1', '11940000-0000-4000-8000-000000150001', '11940000-0000-4000-8000-000000000010', 'P for Hero 1', 'revealed',
   array['11940000-0000-4000-8000-000000000020']::uuid[]),
  ('11940000-0000-4000-8000-0000001500b2', '11940000-0000-4000-8000-000000150001', '11940000-0000-4000-8000-000000000010', 'P hidden', 'hidden', null);
insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('11940000-0000-4000-8000-000000150021', '11940000-0000-4000-8000-000000150001', 'Only Hero 1 knows', 'pending', 1);

select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000150001'), 0,
  'a beat shown to some members posts no Quest shared message (fails if members-only beats announce to the table)');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001')),
  1, 'the member the beat is shown to sees the quest');
select is(
  (select array_agg(id) from public.get_player_visible_quest_beats('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001')),
  array['11940000-0000-4000-8000-0000001500b1']::uuid[], 'and exactly that beat');
select is((select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-000000150001'), 1,
  'and reads the quest''s pending objective');
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
select is_empty(
  $$select id from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001')$$,
  'the other member does not see the quest (fails if a beat shown to one shows the quest to all)');
select is_empty(
  $$select id from public.get_player_visible_quest_beats('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001')$$,
  'nor its beat');
select is((select count(*)::integer from public.quest_objectives where quest_id = '11940000-0000-4000-8000-000000150001'), 0,
  'nor its objectives');

-- DM preview as each hero.
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001',
     '11940000-0000-4000-8000-000000000020')),
  1, 'the DM''s preview as Hero 1 shows the quest');
select is_empty(
  $$select id from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001',
     '11940000-0000-4000-8000-000000000021')$$,
  'the preview as Hero 2 does not');
select is_empty(
  $$select id from public.get_player_visible_quest_beats('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001',
     '11940000-0000-4000-8000-000000000021')$$,
  'nor does its beat list');
reset role;

-- Positive control: a whole-party beat shows the quest to both, and announces it.
update public.quest_beats set visibility = 'rumored' where id = '11940000-0000-4000-8000-0000001500b2';
select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000150001'), 1,
  'the first whole-party beat to show posts the announcement, even after a members-only beat showed');
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11940000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::integer from public.get_player_visible_quests('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000150001')),
  1, 'and now the other member sees the quest');
reset role;

-- reveal_quest to named members reveals the entry to them only (a handout given to Hero 1).
insert into public.quests (id, user_id, campaign_id, title) values
  ('11940000-0000-4000-8000-000000160001', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-000000000010', 'Quest S');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000001600b1', '11940000-0000-4000-8000-000000160001', '11940000-0000-4000-8000-000000000010', 'S entry');
update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000001600b1' where id = '11940000-0000-4000-8000-000000160001';
select private.reveal_quest('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000160001',
  array['11940000-0000-4000-8000-000000000020']::uuid[]);
select is((select visible_to from public.quest_beats where id = '11940000-0000-4000-8000-0000001600b1'),
  array['11940000-0000-4000-8000-000000000020']::uuid[], 'revealing to Hero 1 rumors the entry for Hero 1 only');
select is(private.quest_shown_to('11940000-0000-4000-8000-000000160001', '11940000-0000-4000-8000-000000000021'), false,
  'so Hero 2 does not see the quest');
select is(pg_temp.shared_messages('11940000-0000-4000-8000-000000160001'), 0, 'and nothing is announced');
select private.reveal_quest('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000160001',
  array['11940000-0000-4000-8000-000000000021']::uuid[]);
select is((select array(select unnest(visible_to) order by 1) from public.quest_beats where id = '11940000-0000-4000-8000-0000001600b1'),
  array['11940000-0000-4000-8000-000000000020', '11940000-0000-4000-8000-000000000021']::uuid[],
  'a later reveal to Hero 2 adds them without dropping Hero 1');
select private.reveal_quest('11940000-0000-4000-8000-000000000010', '11940000-0000-4000-8000-000000160001', null);
select is((select visible_to from public.quest_beats where id = '11940000-0000-4000-8000-0000001600b1'), null,
  'a reveal to everyone widens the entry beat to the whole party');

-- The reveal verb is gone.
select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_objective_id)
    values ('11940000-0000-4000-8000-0000000e0001', '11940000-0000-4000-8000-0000000e00b1', 'reveal', '11940000-0000-4000-8000-0000000e0021')$$,
  '23514', null, 'the reveal verb is rejected by the check constraint'
);

select * from finish();
rollback;
