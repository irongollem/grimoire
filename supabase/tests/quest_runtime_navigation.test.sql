begin;

create extension if not exists pgtap with schema extensions;
select plan(39);

select has_function(
  'public', 'transition_quest_runtime',
  array['uuid', 'text', 'bigint', 'uuid', 'uuid', 'uuid', 'text', 'boolean', 'jsonb'],
  'runtime movement has one atomic command boundary'
);
select has_function('public', 'get_quest_runtime_context', array['uuid'], 'runtime selectors have one server-authorized projection');
select has_function('public', 'search_quest_runtime_jump_targets', array['uuid', 'text', 'integer'], 'jump picker has a campaign-scoped search projection');
select has_column('public', 'quest_runtime_state', 'status', 'runtime state records its lifecycle');
select has_column('public', 'quest_runtime_state', 'version', 'runtime state supports optimistic concurrency');
select has_column('public', 'quest_runtime_state', 'visit_stack', 'runtime state records navigable visit order');
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

select is((select count(*)::integer from public.search_quest_runtime_jump_targets('66800000-0000-4000-8000-000000000010')), 5, 'jump search returns eligible beats in the current campaign');
select is((select count(*)::integer from public.search_quest_runtime_jump_targets('66800000-0000-4000-8000-000000000010', 'Side')), 2, 'jump search matches both quest and beat labels');
-- Every quest carries an auto-created overview beat. It sits outside the edge
-- graph, so parking the live cursor on it would strand the cockpit.
select is(
  (select count(*)::integer from public.search_quest_runtime_jump_targets('66800000-0000-4000-8000-000000000010', 'overview')),
  0,
  'quest overview beats are never offered as runtime jump targets'
);

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'start', 0,
    '66800000-0000-4000-8000-000000000020', '66800000-0000-4000-8000-000000000030'
  ) -> 'current' ->> 'title',
  'A', 'start enters the chosen beat'
);
select is((select version from public.quest_runtime_state where campaign_id = '66800000-0000-4000-8000-000000000010'), 1::bigint, 'start increments the runtime version');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '66800000-0000-4000-8000-000000000010'), 1, 'start appends history atomically');

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'advance', 1,
    p_edge_id => '66800000-0000-4000-8000-000000000040'
  ) -> 'current' ->> 'title',
  'B', 'advance follows an authored outgoing edge'
);
select is((select provenance ->> 'edge_label' from public.quest_beat_transitions where runtime_version = 2), 'To B', 'advance snapshots its authored route');
select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'advance', 2,
    p_edge_id => '66800000-0000-4000-8000-000000000041'
  ) -> 'current' ->> 'title',
  'A', 'authored cycles remain navigable'
);
select is((select jsonb_array_length(visit_stack) from public.quest_runtime_state where campaign_id = '66800000-0000-4000-8000-000000000010'), 3, 'repeated visits remain distinct in visit history');

select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'previous', 3) -> 'current' ->> 'title', 'B', 'previous follows the actual prior visit');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'previous', 4) -> 'current' ->> 'title', 'A', 'repeated previous walks farther back without ping-ponging');
select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'advance', 5,
    p_edge_id => '66800000-0000-4000-8000-000000000042'
  ) -> 'current' ->> 'title',
  'C', 'advancing after previous creates a new visited path'
);
select is((select jsonb_array_length(visit_stack) from public.quest_runtime_state where campaign_id = '66800000-0000-4000-8000-000000000010'), 2, 'a new path truncates abandoned forward visit state');
select throws_ok(
  $$ select public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'pause', 5) $$,
  '40001', 'Quest runtime changed; expected version 5, current version 6',
  'a stale co-DM command fails instead of overwriting the winner'
);

select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'jump', 6,
    '66800000-0000-4000-8000-000000000021', '66800000-0000-4000-8000-000000000033',
    p_reason => 'Players chased the courier', p_push_return => true
  ) -> 'current' ->> 'title',
  'Side scene', 'jump can enter another quest in the campaign'
);
select is(public.get_quest_runtime_context('66800000-0000-4000-8000-000000000010') -> 'return_target' ->> 'beat_id', '66800000-0000-4000-8000-000000000032', 'cross-quest jump preserves an explicit return point');
select is((select visibility from public.quest_beats where id = '66800000-0000-4000-8000-000000000033'), 'hidden', 'navigation never changes player visibility');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'return', 7) -> 'current' ->> 'title', 'C', 'return restores the saved quest and beat');

select throws_ok(
  $$ select public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'improv', 8,
    '66800000-0000-4000-8000-000000000021', '66800000-0000-4000-8000-000000000033',
    p_reason => 'Unexpected scene'
  ) $$,
  'P0001', 'Target beat is not eligible in this campaign',
  'improv cannot mislabel a normal authored beat'
);
select is(
  public.transition_quest_runtime(
    '66800000-0000-4000-8000-000000000010', 'improv', 8,
    '66800000-0000-4000-8000-000000000021', '66800000-0000-4000-8000-000000000034',
    p_reason => 'Unexpected scene'
  ) -> 'current' ->> 'title',
  'Improvised scene', 'improv records entry into a deliberately improvised beat'
);
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'pause', 9) -> 'state' ->> 'status', 'paused', 'pause is an explicit history-producing command');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'resume', 10) -> 'state' ->> 'status', 'running', 'resume is explicit and retains the current beat');
select is(public.transition_quest_runtime('66800000-0000-4000-8000-000000000010', 'end', 11) -> 'state' ->> 'status', 'ended', 'end closes the runtime explicitly');
select is((select current_beat_id from public.quest_runtime_state where campaign_id = '66800000-0000-4000-8000-000000000010'), null::uuid, 'end clears the live cursor');
select is((select transition_kind from public.quest_beat_transitions where runtime_version = 12), 'end', 'end is preserved in append-only history');

select throws_ok(
  $$ update public.quest_beat_transitions set reason = 'forged' where runtime_version = 1 $$,
  '42501', null, 'authenticated clients cannot rewrite history'
);

reset role;
delete from public.quest_beats where id = '66800000-0000-4000-8000-000000000032';
select is((select to_beat_id from public.quest_beat_transitions where runtime_version = 6), null::uuid, 'deleting an authored beat detaches rather than deletes history');
select is((select to_beat_title from public.quest_beat_transitions where runtime_version = 6), 'C', 'history keeps its beat title snapshot after detachment');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '66800000-0000-4000-8000-000000000010'), 12, 'every successful command produced exactly one durable history row');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66800000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.get_quest_runtime_context('66800000-0000-4000-8000-000000000010') $$,
  'P0001', 'Not authorized', 'an outsider cannot inspect the DM runtime'
);

select * from finish();
rollback;
