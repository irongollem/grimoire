-- The runtime runs one thread at a time. Story #852, epic #850.
--
-- Cover for the thread-scoped rewrite of the quest runtime: a plain advance
-- moves one thread and leaves its siblings alone; a parallel route spawns a
-- thread instead of moving the cursor; a converge-all beat parks an arriving
-- thread until every incoming route has been walked and then merges the
-- threads that reach it, firing arrival rules exactly once; a payoff can be
-- held instead of performed, and fired later from the log; the three verbs
-- (grant_knowledge, owe_favor, award_milestone) write to the tables they
-- promised to and undo by handle like everything else; and a campaign member
-- who is not the DM can reach none of it.
begin;

create extension if not exists pgtap with schema extensions;
select plan(73);

-- Fixture inserts below run as postgres between scenarios (reset role), so
-- none of them should be quota-checked against a stale sub left by whichever
-- scenario last set one.
set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('85200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'thread852-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('85200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'thread852-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000001', 'Thread campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- ════════════════════════════════════════════════════════════════════════════
-- Runner quest: (1) a plain advance moves one thread and leaves a manually
-- opened sibling alone; (2) advancing while spawning opens a parallel thread
-- carrying the edge's label, its own transition, and the edge's own rule; (3)
-- naming a parallel edge to p_edge_id is refused; (4) a gated parallel edge
-- with a closed gate is refused, whether advancing or spawning; (5) a held
-- rule logs without applying, and fires later from perform_quest_consequence;
-- (9) get_quest_runtime_context's threads/outgoing/held.
-- ════════════════════════════════════════════════════════════════════════════

insert into public.quests (id, user_id, campaign_id, title)
values ('85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', 'Runner');

insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('85200000-0000-4000-8000-000000000030', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'R1 fork'),
  ('85200000-0000-4000-8000-000000000031', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'R2 onward'),
  ('85200000-0000-4000-8000-000000000032', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'R3 side jaunt target'),
  ('85200000-0000-4000-8000-000000000033', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'RGated'),
  ('85200000-0000-4000-8000-000000000034', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'R4 manual thread beat'),
  ('85200000-0000-4000-8000-000000000035', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'R5 payoff target');

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label) values
  ('85200000-0000-4000-8000-000000000040', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000030', '85200000-0000-4000-8000-000000000031', 'choice', null),
  ('85200000-0000-4000-8000-000000000041', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000030', '85200000-0000-4000-8000-000000000032', 'parallel', 'Side jaunt'),
  ('85200000-0000-4000-8000-000000000042', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000030', '85200000-0000-4000-8000-000000000033', 'parallel', 'Gated jaunt'),
  ('85200000-0000-4000-8000-000000000043', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000031', '85200000-0000-4000-8000-000000000035', 'choice', null);

insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, sort_order) values
  ('85200000-0000-4000-8000-000000000050', '85200000-0000-4000-8000-000000000020', 'Spawned thread found something', 'dormant', false, 1),
  ('85200000-0000-4000-8000-000000000051', '85200000-0000-4000-8000-000000000020', 'Find the passphrase', 'pending', true, 2),
  ('85200000-0000-4000-8000-000000000052', '85200000-0000-4000-8000-000000000020', 'Held on arrival at R2', 'dormant', false, 3),
  ('85200000-0000-4000-8000-000000000053', '85200000-0000-4000-8000-000000000020', 'Payoff for R2->R5', 'pending', true, 4);

insert into public.quest_consequences (id, quest_id, on_edge_id, action, target_objective_id) values
  ('85200000-0000-4000-8000-000000000060', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000041', 'reveal', '85200000-0000-4000-8000-000000000050');
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id) values
  ('85200000-0000-4000-8000-000000000061', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000031', 'reveal', '85200000-0000-4000-8000-000000000052');
insert into public.quest_consequences (id, quest_id, on_edge_id, action, target_objective_id) values
  ('85200000-0000-4000-8000-000000000062', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000043', 'complete', '85200000-0000-4000-8000-000000000053');

insert into public.quest_beat_edge_gates (edge_id, quest_id, campaign_id, objective_id, status) values
  ('85200000-0000-4000-8000-000000000042', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000051', 'complete');

-- A site-tier location with two rooms, staged at R5, for the 'site' key.
insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('85200000-0000-4000-8000-000000000090', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', 'The Sunken Keep', 'building');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('85200000-0000-4000-8000-000000000091', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000090', 'Antechamber', 'room'),
  ('85200000-0000-4000-8000-000000000092', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000090', 'Sanctum', 'room');
update public.quest_beats set staged_at_location_id = '85200000-0000-4000-8000-000000000090' where id = '85200000-0000-4000-8000-000000000035';

insert into public.loot_placements (id, beat_id, quest_id, campaign_id, kind, label, payload, sort_order) values
  ('85200000-0000-4000-8000-000000000095', '85200000-0000-4000-8000-000000000035', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000010', 'currency', 'Stipend', '{"gp": 10}'::jsonb, 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '85200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── A manually opened thread sits beside Main untouched ─────────────────────

create temporary table open_result_r(payload jsonb) on commit drop;
insert into open_result_r
select public.open_quest_thread(
  '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
  '85200000-0000-4000-8000-000000000034', 'Side thread'
);
select is((select payload -> 'thread' ->> 'label' from open_result_r), 'Side thread', 'open_quest_thread opens a manual thread at the named beat');
select is((select payload -> 'current' ->> 'title' from open_result_r), 'R4 manual thread beat', 'the manual thread''s cursor sits at the beat it was opened on');

select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
    'start', 0, '85200000-0000-4000-8000-000000000030'
  )
$$, 'Main starts at the fork');

select is(
  (select count(*)::integer from public.get_campaign_live_quests('85200000-0000-4000-8000-000000000010') where quest_id = '85200000-0000-4000-8000-000000000020'),
  2, 'two threads are open on Runner: Main and Side thread'
);
select is(
  (select sibling_count from public.get_campaign_live_quests('85200000-0000-4000-8000-000000000010') where thread_label = 'Side thread'),
  2, 'sibling_count counts every live thread of the quest, itself included'
);

-- ── (3) a parallel edge cannot be walked by advance ─────────────────────────

select throws_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
    'advance', 1, null, '85200000-0000-4000-8000-000000000041'
  )
$$, '23514', 'a parallel route is walked by spawning, not by advancing', 'p_edge_id naming a parallel edge is refused');

-- ── (4) a gated parallel edge with a closed gate cannot be spawned ──────────

select throws_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
    'advance', 1, null, '85200000-0000-4000-8000-000000000040', null, false, '{}'::jsonb,
    array['85200000-0000-4000-8000-000000000042'::uuid]
  )
$$, '23514', 'That route needs "Find the passphrase" to be complete, and it is pending', 'a gated parallel edge with a closed gate is refused even as a spawn');

select is(
  (select current_beat_id from public.quest_runtime_state
    where campaign_id = '85200000-0000-4000-8000-000000000010' and quest_id = '85200000-0000-4000-8000-000000000020'
      and thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main')),
  '85200000-0000-4000-8000-000000000030'::uuid, 'the rejected spawn attempt left Main exactly where it was'
);
select is(
  (select count(*)::integer from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020'),
  2, 'the rejected spawn attempt created no thread'
);

-- ── (2) + (5): advance, spawn a parallel thread, and hold R2's arrival rule ─

create temporary table advance_result_r(payload jsonb) on commit drop;
insert into advance_result_r
select public.transition_quest_runtime(
  '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
  (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
  'advance', 1, null, '85200000-0000-4000-8000-000000000040', null, false, '{}'::jsonb,
  array['85200000-0000-4000-8000-000000000041'::uuid],
  array['85200000-0000-4000-8000-000000000061'::uuid]
);

select is((select payload -> 'current' ->> 'title' from advance_result_r), 'R2 onward', 'Main advanced to R2 along the choice edge');
select is(
  (select count(*)::integer from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Side jaunt'),
  1, 'spawning opened a new thread carrying the edge''s own label'
);
select is(
  (select status from public.quest_threads where label = 'Side jaunt'),
  'live', 'the spawned thread is live'
);
select is(
  (select current_beat_id from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where label = 'Side jaunt')),
  '85200000-0000-4000-8000-000000000032'::uuid, 'the spawned thread''s own cursor sits at the parallel target'
);
select is(
  (select status from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where label = 'Side jaunt')),
  'running', 'the spawned thread''s runtime row is running'
);
select is(
  (select t.provenance ->> 'spawned_by_edge_id' from public.quest_beat_transitions t
    where t.thread_id = (select id from public.quest_threads where label = 'Side jaunt') and t.transition_kind = 'enter'),
  '85200000-0000-4000-8000-000000000041', 'the spawned thread''s enter transition carries the edge that opened it'
);
select is(
  (select o.status from public.quest_objectives o where o.id = '85200000-0000-4000-8000-000000000050'),
  'pending', 'the parallel edge''s own rule fired on the new thread''s transition'
);
select is(
  (select current_beat_id from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Side thread')),
  '85200000-0000-4000-8000-000000000034'::uuid, 'the manually opened sibling thread never moved'
);

-- The held rule: logged, not applied.
select is(
  (select o.status from public.quest_objectives o where o.id = '85200000-0000-4000-8000-000000000052'),
  'dormant', 'a held rule leaves its objective untouched'
);
select ok(
  (select held_at is not null and performed_at is null
     from public.quest_consequence_events where consequence_id = '85200000-0000-4000-8000-000000000061'),
  'a held rule logs its event with held_at, not performed_at'
);

-- (9) get_quest_runtime_context: threads, outgoing[].route_kind/payoff/loot/site, held.

create temporary table context_result_r(payload jsonb) on commit drop;
insert into context_result_r
select public.get_quest_runtime_context(
  '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
  (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main')
);

select is((select jsonb_array_length(payload -> 'threads') from context_result_r), 3, 'threads lists every thread of the quest: Main, Side thread, Side jaunt');
select is((select jsonb_array_length(payload -> 'held') from context_result_r), 1, 'held lists the one not-yet-performed held event');
select is((select payload -> 'held' -> 0 ->> 'beat_id' from context_result_r), '85200000-0000-4000-8000-000000000031', 'the held entry names the beat whose arrival it belongs to');
select is(
  (select elem ->> 'route_kind' from context_result_r, jsonb_array_elements(payload -> 'outgoing') elem
    where elem ->> 'edge_id' = '85200000-0000-4000-8000-000000000043'),
  'choice', 'outgoing carries route_kind'
);
select is(
  (select elem -> 'payoff' -> 0 ->> 'action' from context_result_r, jsonb_array_elements(payload -> 'outgoing') elem
    where elem ->> 'edge_id' = '85200000-0000-4000-8000-000000000043'),
  'complete', 'outgoing carries the route''s payoff'
);
select is(
  (select elem -> 'loot' -> 0 ->> 'kind' from context_result_r, jsonb_array_elements(payload -> 'outgoing') elem
    where elem ->> 'edge_id' = '85200000-0000-4000-8000-000000000043'),
  'currency', 'outgoing carries the target beat''s undispatched loot'
);
select is(
  (select (elem -> 'site' ->> 'room_count')::integer from context_result_r, jsonb_array_elements(payload -> 'outgoing') elem
    where elem ->> 'edge_id' = '85200000-0000-4000-8000-000000000043'),
  2, 'outgoing carries the target''s site info when it is staged at a site-tier location'
);

-- Firing the held event from the log.
select lives_ok($$
  select public.perform_quest_consequence(
    (select id from public.quest_consequence_events where consequence_id = '85200000-0000-4000-8000-000000000061'),
    1492, 3, 1
  )
$$, 'a held ledger verb can be performed later from the log');
select is(
  (select o.status from public.quest_objectives o where o.id = '85200000-0000-4000-8000-000000000052'),
  'pending', 'firing the held reveal wakes the dormant objective'
);
select ok(
  (select is_player_visible from public.quest_objectives where id = '85200000-0000-4000-8000-000000000052'),
  'firing the held reveal makes the objective player-visible'
);
select ok(
  (select performed_at is not null and held_at is null
     from public.quest_consequence_events where consequence_id = '85200000-0000-4000-8000-000000000061'),
  'performing a held event stamps performed_at and clears held_at'
);
select is(
  (select jsonb_array_length(payload -> 'held') from (
    select public.get_quest_runtime_context(
      '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
      (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main')
    ) payload
  ) x),
  0, 'held is empty again once the one held event has been performed'
);

-- ════════════════════════════════════════════════════════════════════════════
-- (6) Converge: two threads reach a converge-all beat over two different
-- routes. The first to arrive parks; the second completes the set and
-- merges — the survivor is whichever arrived FIRST, so it is the first
-- thread that ends up running, not the one whose call closed the gap.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', 'Converge');

insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values
  ('85200000-0000-4000-8000-000000000060', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000010', 'C1', 'any'),
  ('85200000-0000-4000-8000-000000000061', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000010', 'C2', 'any'),
  ('85200000-0000-4000-8000-000000000062', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000010', 'CAll', 'all');

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('85200000-0000-4000-8000-000000000070', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000060', '85200000-0000-4000-8000-000000000062'),
  ('85200000-0000-4000-8000-000000000071', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000061', '85200000-0000-4000-8000-000000000062');

insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('85200000-0000-4000-8000-000000000080', '85200000-0000-4000-8000-000000000021', 'Both stories converge', 'dormant', 1);
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id) values
  ('85200000-0000-4000-8000-000000000081', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000062', 'reveal', '85200000-0000-4000-8000-000000000080');
-- A rule on the C1 ROUTE, not on the beat: the route was walked whether or
-- not the beat parks the thread, so this one fires on arrival.
insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('85200000-0000-4000-8000-000000000082', '85200000-0000-4000-8000-000000000021', 'Came by the C1 road', 'dormant', 2);
insert into public.quest_consequences (id, quest_id, on_edge_id, action, target_objective_id) values
  ('85200000-0000-4000-8000-000000000083', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000070', 'raise', '85200000-0000-4000-8000-000000000082');

set local role authenticated;
select set_config('request.jwt.claim.sub', '85200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000021',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main'),
    'start', 0, '85200000-0000-4000-8000-000000000060'
  )
$$, 'Main starts at C1');

insert into open_result_r
select public.open_quest_thread('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000021', '85200000-0000-4000-8000-000000000061', 'Second');

select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000021',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main'),
    'advance', 1, null, '85200000-0000-4000-8000-000000000070'
  )
$$, 'Main advances into CAll first, over the C1 route');

select is(
  (select status from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main')),
  'waiting', 'the first arrival at a converge-all beat parks rather than running through'
);
select is(
  (select status from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main'),
  'waiting', 'the parked thread''s own status also reads waiting'
);
select is(
  (select status from public.quest_objectives where id = '85200000-0000-4000-8000-000000000080'),
  'dormant', 'the beat''s arrival rule does not fire while the set is incomplete'
);
select is(
  (select status from public.quest_objectives where id = '85200000-0000-4000-8000-000000000082'),
  'pending', 'but the rule on the route it walked fires at once — the route was taken whether or not the beat parks the thread'
);

select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000021',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second'),
    'advance', 1, null, '85200000-0000-4000-8000-000000000071'
  )
$$, 'Second advances into CAll over the C2 route, completing the set');

select is(
  (select status from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main'),
  'live', 'the earliest-arrived thread survives the merge, running again'
);
select is(
  (select status from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main')),
  'running', 'the survivor''s runtime row is running'
);
select is(
  (select status from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second'),
  'merged', 'the second-arrived thread is folded into the survivor'
);
select is(
  (select merged_into_thread_id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second'),
  (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main'),
  'the merged thread names its survivor'
);
select is(
  (select status from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second')),
  'ended', 'the merged thread''s runtime row is ended'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions
    where thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second')
      and transition_kind = 'end' and provenance ->> 'merged_into' = (select id::text from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Main')),
  1, 'the merged thread''s end transition names the survivor it was merged into'
);
select is(
  (select status from public.quest_objectives where id = '85200000-0000-4000-8000-000000000080'),
  'pending', 'the arrival rule fires once the set completes'
);
select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '85200000-0000-4000-8000-000000000081'),
  1, 'the beat''s arrival rule fired exactly once, not once per arriving thread'
);

-- ════════════════════════════════════════════════════════════════════════════
-- (7) The three verbs write to the tables they promised, and undo by handle
-- like every other world action.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', 'Verbs');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('85200000-0000-4000-8000-0000000000a0', '85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-000000000010', 'V1'),
  ('85200000-0000-4000-8000-0000000000a1', '85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-000000000010', 'V2');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('85200000-0000-4000-8000-0000000000b0', '85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-0000000000a0', '85200000-0000-4000-8000-0000000000a1');
insert into public.npcs (id, user_id, campaign_id, name)
values ('85200000-0000-4000-8000-0000000000c0', '85200000-0000-4000-8000-000000000001', '85200000-0000-4000-8000-000000000010', 'The blacksmith');
insert into public.quest_consequences (id, quest_id, on_edge_id, action, action_payload) values
  ('85200000-0000-4000-8000-0000000000d0', '85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-0000000000b0', 'grant_knowledge', '{"text":"The party learns of the hidden shrine."}'::jsonb);
insert into public.quest_consequences (id, quest_id, on_edge_id, action, target_npc_id, action_payload) values
  ('85200000-0000-4000-8000-0000000000d1', '85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-0000000000b0', 'owe_favor', '85200000-0000-4000-8000-0000000000c0', '{"text":"The blacksmith owes the party a favor."}'::jsonb);
insert into public.quest_consequences (id, quest_id, on_edge_id, action, action_payload) values
  ('85200000-0000-4000-8000-0000000000d2', '85200000-0000-4000-8000-000000000022', '85200000-0000-4000-8000-0000000000b0', 'award_milestone', '{"text":"The party earned the town''s trust."}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '85200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000022',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000022' and label = 'Main'),
    'start', 0, '85200000-0000-4000-8000-0000000000a0'
  )
$$, 'Verbs starts at V1');
select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000022',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000022' and label = 'Main'),
    'advance', 1, null, '85200000-0000-4000-8000-0000000000b0'
  )
$$, 'and advances into V2, firing all three verbs');

select is(
  (select count(*)::integer from public.player_journal_entries
    where campaign_id = '85200000-0000-4000-8000-000000000010' and ref_type = 'quest' and ref_id = '85200000-0000-4000-8000-000000000022'),
  1, 'grant_knowledge wrote a shared journal entry'
);
select ok(
  (select not is_private from public.player_journal_entries
    where campaign_id = '85200000-0000-4000-8000-000000000010' and ref_id = '85200000-0000-4000-8000-000000000022'),
  'the journal entry is shared, not private'
);

-- The shared journal row is visible to a member who is not its own user_id.
select set_config('request.jwt.claim.sub', '85200000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.player_journal_entries
    where campaign_id = '85200000-0000-4000-8000-000000000010' and ref_id = '85200000-0000-4000-8000-000000000022'),
  1, 'a campaign member can read the shared journal entry grant_knowledge wrote'
);
select set_config('request.jwt.claim.sub', '85200000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.npc_favors where npc_id = '85200000-0000-4000-8000-0000000000c0'),
  1, 'owe_favor wrote a favor on the named NPC'
);
select is(
  (select count(*)::integer from public.party_milestones where quest_id = '85200000-0000-4000-8000-000000000022'),
  1, 'award_milestone wrote a milestone'
);
select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '85200000-0000-4000-8000-000000000010' and message like '🏅 %'),
  1, 'award_milestone also posted a broadcast'
);

-- previous undoes the V1->V2 arrival — all three verbs, by handle.
select lives_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000022',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000022' and label = 'Main'),
    'previous', 2
  )
$$, 'stepping back undoes the arrival that fired the three verbs');

select is(
  (select count(*)::integer from public.player_journal_entries where ref_id = '85200000-0000-4000-8000-000000000022'),
  0, 'previous deletes the journal entry grant_knowledge wrote'
);
select is(
  (select count(*)::integer from public.npc_favors where npc_id = '85200000-0000-4000-8000-0000000000c0'),
  0, 'previous deletes the favor owe_favor wrote'
);
select is(
  (select count(*)::integer from public.party_milestones where quest_id = '85200000-0000-4000-8000-000000000022'),
  0, 'previous deletes the milestone award_milestone wrote'
);
select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '85200000-0000-4000-8000-000000000010' and message like '🏅 %'),
  0, 'previous deletes the milestone''s broadcast too'
);

-- ════════════════════════════════════════════════════════════════════════════
-- (10) close_quest_thread, and refusing a merged thread.
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok($$
  select public.close_quest_thread('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Side thread'))
$$, 'closing a never-advanced manual thread succeeds');
select is(
  (select status from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Side thread'),
  'closed', 'the closed thread is marked closed'
);
select isnt(
  (select closed_at from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Side thread'),
  null, 'closing stamps closed_at'
);
select is(
  (select status from public.quest_runtime_state
    where thread_id = (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Side thread')),
  'ended', 'closing a thread with a live cursor ends its runtime row too'
);

select throws_ok($$
  select public.close_quest_thread('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000021',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second'))
$$, '23514', null, 'a merged thread cannot be closed by hand — it is already accounted for');

select throws_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000021',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000021' and label = 'Second'),
    'pause', 0
  )
$$, '23514', null, 'a merged thread cannot be commanded at all');

-- ════════════════════════════════════════════════════════════════════════════
-- (11) A campaign member who is not the DM cannot reach any of this.
-- ════════════════════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', '85200000-0000-4000-8000-000000000002', true);

select throws_ok($$
  select public.transition_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
    'pause', 2
  )
$$, 'Not authorized', 'a member cannot move a thread');

select throws_ok($$
  select public.assert_quest_runtime(
    '85200000-0000-4000-8000-000000000010'::uuid, '85200000-0000-4000-8000-000000000020'::uuid,
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
    array['85200000-0000-4000-8000-000000000030'::uuid]
  )
$$, 'Not authorized', 'a member cannot assert history onto a thread');

select throws_ok($$
  select public.improvise_quest_runtime(
    '85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'),
    2, 'Intrusion'
  )
$$, 'Not authorized', 'a member cannot improvise on a thread');

select throws_ok($$
  select public.open_quest_thread('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020', '85200000-0000-4000-8000-000000000034', 'Rogue thread')
$$, 'Not authorized', 'a member cannot open a thread');

select throws_ok($$
  select public.close_quest_thread('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'))
$$, 'Not authorized', 'a member cannot close a thread');

select throws_ok($$
  select public.get_quest_runtime_context('85200000-0000-4000-8000-000000000010', '85200000-0000-4000-8000-000000000020',
    (select id from public.quest_threads where quest_id = '85200000-0000-4000-8000-000000000020' and label = 'Main'))
$$, 'Not authorized', 'a member cannot read the DM runtime context');

select throws_ok($$
  select public.get_campaign_live_quests('85200000-0000-4000-8000-000000000010')
$$, 'Not authorized', 'a member cannot enumerate the open threads');

select throws_ok($$
  select public.archive_quest_beat('85200000-0000-4000-8000-000000000030')
$$, 'P0002', 'Beat not found or not editable', 'a member cannot archive a beat');

select * from finish();
rollback;
