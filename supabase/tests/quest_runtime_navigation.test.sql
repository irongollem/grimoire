begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

select has_function(
  'public', 'transition_quest_runtime',
  array['uuid', 'uuid', 'text', 'bigint', 'uuid', 'uuid', 'text', 'boolean', 'jsonb'],
  'runtime movement has one atomic command boundary, scoped to a quest'
);
select has_function('public', 'get_quest_runtime_context', array['uuid', 'uuid'], 'runtime selectors have one server-authorized projection per chain');
select has_function('public', 'get_campaign_live_quests', array['uuid'], 'the open chains are a set, not a single row');
select has_function('public', 'end_campaign_quest_session', array['uuid'], 'closing the table is its own command');
select has_function('public', 'search_quest_runtime_jump_targets', array['uuid', 'uuid', 'text', 'integer'], 'jump picker is scoped to the chain it moves');
select has_column('public', 'quest_runtime_state', 'quest_id', 'the cursor belongs to a quest');
select col_is_pk('public', 'quest_runtime_state', array['campaign_id', 'quest_id'], 'one cursor per quest, not per campaign');
select hasnt_column('public', 'quest_runtime_state', 'current_quest_id', 'the quest is the key, so it cannot also be a mutable column');
select ok(not has_table_privilege('authenticated', 'public.quest_runtime_state', 'INSERT'), 'clients cannot split cursor creation from history');
select ok(not has_table_privilege('authenticated', 'public.quest_beat_transitions', 'INSERT'), 'clients cannot forge runtime history');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('66800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue668-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('66800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue668-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000001', 'Runtime campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000001', 'dm', 'Runtime DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title) values
  ('66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000001', '66800000-0000-4000-8000-000000000010', 'Main road'),
  ('66800000-0000-4000-8000-000000000021', '66800000-0000-4000-8000-000000000001', '66800000-0000-4000-8000-000000000010', 'Side road');

insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, is_improvised) values
  ('66800000-0000-4000-8000-000000000030', '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000010', 'A', 'hidden', false),
  ('66800000-0000-4000-8000-000000000031', '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000010', 'B', 'hidden', false),
  ('66800000-0000-4000-8000-000000000032', '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000010', 'C', 'hidden', false),
  ('66800000-0000-4000-8000-000000000033', '66800000-0000-4000-8000-000000000021', '66800000-0000-4000-8000-000000000010', 'Side scene', 'hidden', false),
  ('66800000-0000-4000-8000-000000000034', '66800000-0000-4000-8000-000000000021', '66800000-0000-4000-8000-000000000010', 'Improvised scene', 'hidden', true);

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('66800000-0000-4000-8000-000000000040', '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000030', '66800000-0000-4000-8000-000000000031', 'To B'),
  ('66800000-0000-4000-8000-000000000041', '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000031', '66800000-0000-4000-8000-000000000030', 'Cycle to A'),
  ('66800000-0000-4000-8000-000000000042', '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000030', '66800000-0000-4000-8000-000000000032', 'Branch to C');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The jump picker only ever offers the chain it can move ───────────────────

select is(
  (select count(*)::integer from public.search_quest_runtime_jump_targets(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020')),
  3, 'jump search returns this quest''s eligible beats');
select is(
  (select count(*)::integer from public.search_quest_runtime_jump_targets(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021')),
  2, 'jump search never leaks another chain''s beats');
-- Every quest carries an auto-created overview beat. It sits outside the edge
-- graph, so parking the live cursor on it would strand the cockpit.
select is(
  (select count(*)::integer from public.search_quest_runtime_jump_targets(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'overview')),
  0, 'quest overview beats are never offered as runtime jump targets');

-- ── One chain moves ──────────────────────────────────────────────────────────

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'start', 0,
    '66800000-0000-4000-8000-000000000030'
  ) -> 'current' ->> 'title',
  'A', 'start enters the chosen beat');
select is((select version from public.quest_runtime_state
  where campaign_id = '66800000-0000-4000-8000-000000000010'
    and quest_id = '66800000-0000-4000-8000-000000000020'), 1::bigint, 'start increments this chain''s version');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '66800000-0000-4000-8000-000000000010'), 1, 'start appends history atomically');

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'advance', 1,
    p_edge_id => '66800000-0000-4000-8000-000000000040'
  ) -> 'current' ->> 'title',
  'B', 'advance follows an authored outgoing edge');
select is((select provenance ->> 'edge_label' from public.quest_beat_transitions where runtime_version = 2), 'To B', 'advance snapshots its authored route');
select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'advance', 2,
    p_edge_id => '66800000-0000-4000-8000-000000000041'
  ) -> 'current' ->> 'title',
  'A', 'authored cycles remain navigable');
select is((select jsonb_array_length(visit_stack) from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), 3, 'repeated visits remain distinct in visit history');

-- Back is undo, and it retraces the order the party actually walked rather than
-- the authored order: a 1-2-3-4 flow played 1-3-4-2 steps back 2-4-3-1.
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'previous', 3) -> 'current' ->> 'title', 'B', 'previous follows the actual prior visit');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'previous', 4) -> 'current' ->> 'title', 'A', 'repeated previous walks farther back without ping-ponging');
select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'advance', 5,
    p_edge_id => '66800000-0000-4000-8000-000000000042'
  ) -> 'current' ->> 'title',
  'C', 'advancing after previous creates a new visited path');
-- Undo-stack semantics on purpose: a DM who wants a beat the back path no longer
-- covers uses Jump, which records why. quest_beat_transitions keeps the full log.
select is((select jsonb_array_length(visit_stack) from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), 2, 'a new path truncates abandoned forward visit state');

select throws_ok(
  $$ select public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020', 'pause', 5) $$,
  '40001', 'Quest runtime changed; expected version 5, current version 6',
  'a stale co-DM command fails instead of overwriting the winner');

-- ── A second chain runs beside the first ─────────────────────────────────────

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'start', 0,
    '66800000-0000-4000-8000-000000000033'
  ) -> 'current' ->> 'title',
  'Side scene', 'a second quest runs without disturbing the first');
select is((select current_beat_id from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), '66800000-0000-4000-8000-000000000032'::uuid,
  'the suspended chain keeps its own place');
select is((select version from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000021'), 1::bigint, 'each chain carries its own version, so co-DMs do not collide');

-- The headline regression. With one campaign-wide stack, `previous` read
-- visit_stack[index-1] and took whatever quest sat there, so stepping back
-- inside the side quest silently returned to the main one.
select throws_ok(
  $$ select public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'previous', 1) $$,
  'P0001', 'There is no previous visited beat',
  'back cannot step out of the chain it is in and land in another quest');

select is((select count(*)::integer from public.get_campaign_live_quests('66800000-0000-4000-8000-000000000010')), 2, 'both open chains are visible at once');
select is(
  (select quest_title from public.get_campaign_live_quests('66800000-0000-4000-8000-000000000010') limit 1),
  'Main road', 'the most recently touched running chain leads');

-- ── A command can only ever move the chain it names ──────────────────────────

select throws_ok(
  $$ select public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'jump', 1,
    '66800000-0000-4000-8000-000000000030', p_reason => 'Reaching across'
  ) $$,
  'P0001', 'Target beat is not eligible in this quest',
  'a jump cannot reach into another quest; switching chains is navigation');

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'jump', 1,
    '66800000-0000-4000-8000-000000000034',
    p_reason => 'Players chased the courier', p_push_return => true
  ) -> 'current' ->> 'title',
  'Improvised scene', 'jump moves within the chain');
select is(
  public.get_quest_runtime_context('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021') -> 'return_target' ->> 'beat_id',
  '66800000-0000-4000-8000-000000000033', 'a within-quest jump still saves an explicit return point');
select is((select visibility from public.quest_beats where id = '66800000-0000-4000-8000-000000000034'), 'hidden', 'navigation never changes player visibility');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'return', 2) -> 'current' ->> 'title', 'Side scene', 'return restores the saved beat');

select throws_ok(
  $$ select public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'improv', 3,
    '66800000-0000-4000-8000-000000000033', p_reason => 'Unexpected scene'
  ) $$,
  'P0001', 'Target beat is not eligible in this quest',
  'improv cannot mislabel a normal authored beat');

select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'pause', 3) -> 'state' ->> 'status', 'paused', 'pause is an explicit history-producing command');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'resume', 4) -> 'state' ->> 'status', 'running', 'resume is explicit and retains the current beat');

-- ── Ending one chain, and ending the night ───────────────────────────────────

select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000021', 'end', 5) -> 'state' ->> 'status', 'ended', 'end closes one chain explicitly');
select is((select current_beat_id from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000021'), null::uuid, 'ending a chain clears its own cursor');
-- Bug 2: the campaign-wide `end` nulled the single cursor, so closing the side
-- quest threw away the murder mystery's position too.
select is((select current_beat_id from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), '66800000-0000-4000-8000-000000000032'::uuid,
  'ending one chain never discards another chain''s position');

select is(public.end_campaign_quest_session('66800000-0000-4000-8000-000000000010'), 1, 'closing the table pauses every chain still running');
select is((select status from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), 'paused', 'the running chain is paused rather than cleared');
select is((select current_beat_id from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), '66800000-0000-4000-8000-000000000032'::uuid,
  'pausing for the night keeps every position for next week');

select throws_ok(
  $$ update public.quest_beat_transitions set reason = 'forged' where runtime_version = 1 $$,
  '42501', null, 'authenticated clients cannot rewrite history');

reset role;
delete from public.quest_beats where id = '66800000-0000-4000-8000-000000000032';
select is((select to_beat_id from public.quest_beat_transitions
  where provenance ->> 'edge_id' = '66800000-0000-4000-8000-000000000042'), null::uuid,
  'deleting an authored beat detaches rather than deletes history');
-- The FK nulls to_quest_id alongside to_beat_id, so the snapshot titles are the
-- only thing left saying where the party had been.
select is((select to_beat_title from public.quest_beat_transitions
  where provenance ->> 'edge_id' = '66800000-0000-4000-8000-000000000042'), 'C',
  'history keeps its beat title snapshot after detachment');
-- The beat vanished, but the chain still exists and still remembers its stack.
select is((select count(*)::integer from public.quest_runtime_state
  where quest_id = '66800000-0000-4000-8000-000000000020'), 1, 'a deleted cursor beat nulls the cursor without deleting the chain');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66800000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.get_quest_runtime_context('66800000-0000-4000-8000-000000000010', '66800000-0000-4000-8000-000000000020') $$,
  'P0001', 'Not authorized', 'an outsider cannot inspect the DM runtime');
select throws_ok(
  $$ select public.get_campaign_live_quests('66800000-0000-4000-8000-000000000010') $$,
  'P0001', 'Not authorized', 'an outsider cannot enumerate the open chains');
select throws_ok(
  $$ select public.end_campaign_quest_session('66800000-0000-4000-8000-000000000010') $$,
  'P0001', 'Not authorized', 'an outsider cannot close the table');

select * from finish();
rollback;
