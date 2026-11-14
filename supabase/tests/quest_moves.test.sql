begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

-- Cover for public.mark_quest_move and public.undo_quest_move (#1183, migration
-- quest_one_screen_moves). Marking records a move that already happened as an
-- `assert` transition and fires the consequences a played arrival would; Undo
-- takes the newest move on a thread back, whether it was marked or played.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('11830000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'moves1183-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11830000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'moves1183-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-000000000001', 'Moves main'),
  ('11830000-0000-4000-8000-000000000011', '11830000-0000-4000-8000-000000000001', 'Moves other');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name) values
  ('11830000-0000-4000-8000-0000000c0001', '11830000-0000-4000-8000-000000000001', '11830000-0000-4000-8000-000000000010', 'Here'),
  ('11830000-0000-4000-8000-0000000c0002', '11830000-0000-4000-8000-000000000001', '11830000-0000-4000-8000-000000000011', 'Elsewhere');

insert into public.campaign_sessions (id, campaign_id, user_id, number, started_at)
values ('11830000-0000-4000-8000-0000000d0001', '11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-000000000001', 1, now());

-- Quest Q: A -> B by one route; C stands alone.
--   B arrives: raises O1.   the route A->B: raises O2.
--   C arrives: raises O4.   C fails: fails O5 (pending) and raises O6.
insert into public.quests (id, user_id, campaign_id, title)
values ('11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000001', '11830000-0000-4000-8000-000000000010', 'Quest Q');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11830000-0000-4000-8000-0000000a00b1', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010', 'A'),
  ('11830000-0000-4000-8000-0000000a00b2', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010', 'B'),
  ('11830000-0000-4000-8000-0000000a00b3', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010', 'C');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id)
values ('11830000-0000-4000-8000-0000000a00e1', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010',
        '11830000-0000-4000-8000-0000000a00b1', '11830000-0000-4000-8000-0000000a00b2');
insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('11830000-0000-4000-8000-0000000a0021', '11830000-0000-4000-8000-0000000a0001', 'O1', 'dormant', 1),
  ('11830000-0000-4000-8000-0000000a0022', '11830000-0000-4000-8000-0000000a0001', 'O2', 'dormant', 2),
  ('11830000-0000-4000-8000-0000000a0024', '11830000-0000-4000-8000-0000000a0001', 'O4', 'dormant', 4),
  ('11830000-0000-4000-8000-0000000a0025', '11830000-0000-4000-8000-0000000a0001', 'O5', 'pending', 5),
  ('11830000-0000-4000-8000-0000000a0026', '11830000-0000-4000-8000-0000000a0001', 'O6', 'dormant', 6);
insert into public.quest_consequences (id, quest_id, on_beat_id, on_edge_id, on_beat_outcome, action, target_objective_id) values
  ('11830000-0000-4000-8000-0000000a0031', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-0000000a00b2', null, 'arrived', 'raise', '11830000-0000-4000-8000-0000000a0021'),
  ('11830000-0000-4000-8000-0000000a0032', '11830000-0000-4000-8000-0000000a0001', null, '11830000-0000-4000-8000-0000000a00e1', 'arrived', 'raise', '11830000-0000-4000-8000-0000000a0022'),
  ('11830000-0000-4000-8000-0000000a0034', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-0000000a00b3', null, 'arrived', 'raise', '11830000-0000-4000-8000-0000000a0024'),
  ('11830000-0000-4000-8000-0000000a0035', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-0000000a00b3', null, 'failed', 'fail', '11830000-0000-4000-8000-0000000a0025'),
  ('11830000-0000-4000-8000-0000000a0036', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-0000000a00b3', null, 'failed', 'raise', '11830000-0000-4000-8000-0000000a0026');

-- Loot: one entry staged on B, one on C.
insert into public.loot_placements (id, campaign_id, quest_id, beat_id, kind, payload, label) values
  ('11830000-0000-4000-8000-0000000a0041', '11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-0000000a00b2', 'currency', '{"coins":{"gp":5}}'::jsonb, 'Coin on B'),
  ('11830000-0000-4000-8000-0000000a0042', '11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-0000000a00b3', 'currency', '{"coins":{"gp":7}}'::jsonb, 'Coin on C');

-- A second quest, R, played with the verbs: P -> X, X raises OX.
insert into public.quests (id, user_id, campaign_id, title)
values ('11830000-0000-4000-8000-0000000b0001', '11830000-0000-4000-8000-000000000001', '11830000-0000-4000-8000-000000000010', 'Quest R');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11830000-0000-4000-8000-0000000b00b1', '11830000-0000-4000-8000-0000000b0001', '11830000-0000-4000-8000-000000000010', 'P'),
  ('11830000-0000-4000-8000-0000000b00b2', '11830000-0000-4000-8000-0000000b0001', '11830000-0000-4000-8000-000000000010', 'X');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id)
values ('11830000-0000-4000-8000-0000000b00e1', '11830000-0000-4000-8000-0000000b0001', '11830000-0000-4000-8000-000000000010',
        '11830000-0000-4000-8000-0000000b00b1', '11830000-0000-4000-8000-0000000b00b2');
insert into public.quest_objectives (id, quest_id, description, status, sort_order)
values ('11830000-0000-4000-8000-0000000b0021', '11830000-0000-4000-8000-0000000b0001', 'OX', 'dormant', 1);
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('11830000-0000-4000-8000-0000000b0031', '11830000-0000-4000-8000-0000000b0001',
        '11830000-0000-4000-8000-0000000b00b2', 'raise', '11830000-0000-4000-8000-0000000b0021');

-- A quest in the other campaign, for the "not in this campaign" refusal.
insert into public.quests (id, user_id, campaign_id, title)
values ('11830000-0000-4000-8000-0000000e0001', '11830000-0000-4000-8000-000000000001', '11830000-0000-4000-8000-000000000011', 'Quest Other');

create or replace function pg_temp.main_thread(p_quest uuid) returns uuid language sql as
  $$ select id from public.quest_threads where quest_id = p_quest and label = 'Main' $$;
grant execute on function pg_temp.main_thread(uuid) to authenticated;

-- An archived beat with a route into it, and a merged thread, for the refusals.
insert into public.quest_beats (id, quest_id, campaign_id, title, kind) values
  ('11830000-0000-4000-8000-0000000a00b9', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010', 'Gone', 'archived');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id)
values ('11830000-0000-4000-8000-0000000a00e9', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010',
        '11830000-0000-4000-8000-0000000a00b1', '11830000-0000-4000-8000-0000000a00b9');
-- A parallel route out of A, for the "taking a parallel route opens a thread" cover.
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, label)
values ('11830000-0000-4000-8000-0000000a00e2', '11830000-0000-4000-8000-0000000a0001', '11830000-0000-4000-8000-000000000010',
        '11830000-0000-4000-8000-0000000a00b1', '11830000-0000-4000-8000-0000000a00b3', 'parallel', 'Scouting');
insert into public.quest_threads (id, campaign_id, quest_id, label, status, merged_into_thread_id)
values ('11830000-0000-4000-8000-0000000a0051', '11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-0000000a0001', 'Side', 'merged',
        pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'));

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Refusal: a player member gets "Not authorized" from both RPCs; the DM
--    call succeeds right after (the positive control). The unauthenticated
--    caller is refused too, before any lookup.
-- ════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'party_here', p_beat_id => '11830000-0000-4000-8000-0000000a00b1'::uuid)$$,
  'Not authorized', 'with no session, mark_quest_move refuses'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11830000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'party_here', p_beat_id => '11830000-0000-4000-8000-0000000a00b1'::uuid)$$,
  'Not authorized', 'a player member cannot mark a move'
);
select throws_ok(
  $$select public.undo_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'))$$,
  'Not authorized', 'a player member cannot undo a move'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '11830000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.undo_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'))$$,
  'P0002', 'Nothing to undo', 'the DM with nothing marked or played has nothing to undo'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000e0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000e0001'), 'party_here', p_beat_id => '11830000-0000-4000-8000-0000000a00b1'::uuid)$$,
  'P0002', 'Quest not found in this campaign', 'a quest of another campaign is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000b0001'), 'party_here', p_beat_id => '11830000-0000-4000-8000-0000000a00b1'::uuid)$$,
  'P0002', 'That thread does not belong to this quest', 'a thread of another quest is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'sideways', p_beat_id => '11830000-0000-4000-8000-0000000a00b1'::uuid)$$,
  '22023', null, 'an unknown kind is refused with 22023'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'party_here', p_beat_id => '11830000-0000-4000-8000-0000000b00b1'::uuid)$$,
  '23503', 'That beat does not belong to this quest', 'a beat of another quest is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'route', p_edge_id => '11830000-0000-4000-8000-0000000b00e1'::uuid)$$,
  '23503', 'That route does not belong to this quest', 'a route of another quest is refused'
);

select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'route', p_edge_id => '11830000-0000-4000-8000-0000000a00e9'::uuid)$$,
  '23514', 'That route leads to an archived beat', 'a route into an archived beat is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      '11830000-0000-4000-8000-0000000a0051'::uuid, 'party_here', p_beat_id => '11830000-0000-4000-8000-0000000a00b1'::uuid)$$,
  '23514', null, 'a merged thread cannot be marked on'
);
select throws_ok(
  $$select public.undo_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      '11830000-0000-4000-8000-0000000a0051'::uuid)$$,
  '23514', null, 'nor undone on'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. route: an assert from the edge's source to its target, stamped with the
--    session and the edge, firing the target's and the edge's rules.
-- ════════════════════════════════════════════════════════════════════════════

create temporary table route_result(payload jsonb);
grant all on route_result to authenticated;
insert into route_result select public.mark_quest_move(
  '11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
  pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'route',
  p_edge_id => '11830000-0000-4000-8000-0000000a00e1'::uuid,
  p_session_id => '11830000-0000-4000-8000-0000000d0001'::uuid);

select is(
  (select count(*)::integer from public.quest_beat_transitions
    where to_beat_id = '11830000-0000-4000-8000-0000000a00b2' and transition_kind = 'assert'
      and from_beat_id = '11830000-0000-4000-8000-0000000a00b1'
      and session_id = '11830000-0000-4000-8000-0000000d0001'
      and provenance ->> 'edge_id' = '11830000-0000-4000-8000-0000000a00e1'
      and provenance ->> 'by' = 'mark'),
  1, 'the route wrote one assert from A to B with the session and the edge'
);
select is((select jsonb_array_length(payload -> 'transition_ids') from route_result), 2, 'the result names the filled-in start and the route');
select is(
  (select count(*)::integer from public.quest_beat_transitions
    where to_beat_id = '11830000-0000-4000-8000-0000000a00b1' and transition_kind = 'assert'
      and provenance ->> 'filled_in' = 'true'
      and provenance ->> 'move_id' = (select payload ->> 'move_id' from route_result)),
  1, 'the thread never reached A, the route''s start, so the move filled it in first, as part of the same move'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0021'),
  'pending', 'the target beat''s arrival rule fired'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0022'),
  'pending', 'the edge''s own rule fired'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions
    where to_beat_id = '11830000-0000-4000-8000-0000000a00b2' and to_quest_id = '11830000-0000-4000-8000-0000000a0001'
      and thread_id = pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001')),
  1, 'B counts as visited on the thread'
);
select is((select payload ->> 'current_beat_id' from route_result), null, 'a route without place_party leaves the cursor alone');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Undo of a marked move: events undone, the transition deleted.
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.undo_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'))$$,
  'undoing the marked route succeeds'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions where to_beat_id = '11830000-0000-4000-8000-0000000a00b2'),
  0, 'the marked transition is gone'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions where to_beat_id = '11830000-0000-4000-8000-0000000a00b1'),
  0, 'and so is the start it filled in: one Undo takes back the whole move'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0021'),
  'dormant', 'the objective its beat rule raised is back to dormant'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0022'),
  'dormant', 'and so is the one its edge rule raised'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. failed on a beat the thread never reached: an arrival, then a failure.
--    Only the fail-outcome rules fire on the failure.
-- ════════════════════════════════════════════════════════════════════════════

create temporary table failed_result(payload jsonb);
grant all on failed_result to authenticated;
insert into failed_result select public.mark_quest_move(
  '11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
  pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'failed',
  p_beat_id => '11830000-0000-4000-8000-0000000a00b3'::uuid);

select is((select jsonb_array_length(payload -> 'transition_ids') from failed_result), 3, 'failing an unvisited beat filled in the way there (A), then wrote an arrival and a failure');
select is(
  (select count(*)::integer from public.quest_beat_transitions
    where to_beat_id = '11830000-0000-4000-8000-0000000a00b3' and outcome is null and transition_kind = 'assert'),
  1, 'one plain arrival'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions
    where to_beat_id = '11830000-0000-4000-8000-0000000a00b3' and outcome = 'failed' and transition_kind = 'assert'),
  1, 'one failed transition'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0024'),
  'pending', 'the arrival rule fired on the arrival'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0025'),
  'failed', 'the fail-outcome rule failed its objective'
);
select is(
  (select array_agg(c.on_beat_outcome order by c.on_beat_outcome)
     from public.quest_consequence_events e
     join public.quest_consequences c on c.id = e.consequence_id
     join public.quest_beat_transitions t on t.id = e.transition_id
    where t.outcome = 'failed'),
  array['failed', 'failed'], 'the failed transition fired only fail-outcome rules'
);
select is(
  (select array_agg(c.on_beat_outcome)
     from public.quest_consequence_events e
     join public.quest_consequences c on c.id = e.consequence_id
     join public.quest_beat_transitions t on t.id = e.transition_id
    where t.to_beat_id = '11830000-0000-4000-8000-0000000a00b3' and t.outcome is null),
  array['arrived'], 'the arrival fired only arrival rules'
);

-- One Undo takes the whole move back: the failure, the arrival and the way in.
select lives_ok(
  $$select public.undo_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'))$$,
  'undo takes back the failed move'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0025'),
  'pending', 'the objective the failure failed is restored'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000a0024'),
  'dormant', 'and the arrival''s own effect too, since the arrival was part of the same move'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. party_here: one arrival per thread, the cursor is placed, loot dispatches
--    only if it is undispatched loot on this very beat, the party moves only
--    to a place of this campaign.
-- ════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'party_here',
      p_beat_id => '11830000-0000-4000-8000-0000000a00b3'::uuid,
      p_dispatch_loot_ids => array['11830000-0000-4000-8000-0000000a0041'::uuid])$$,
  '23514', 'One or more loot entries are not undispatched loot on the target beat',
  'loot staged on another beat is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
      pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'party_here',
      p_beat_id => '11830000-0000-4000-8000-0000000a00b3'::uuid,
      p_move_party_to => '11830000-0000-4000-8000-0000000c0002'::uuid)$$,
  '23503', 'That place is not in this campaign', 'a place of another campaign is refused'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions where to_beat_id = '11830000-0000-4000-8000-0000000a00b3' and outcome is null),
  0, 'the refused calls wrote nothing: C has no arrival yet'
);

create temporary table here_result(payload jsonb);
grant all on here_result to authenticated;
insert into here_result select public.mark_quest_move(
  '11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
  pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'party_here',
  p_beat_id => '11830000-0000-4000-8000-0000000a00b3'::uuid,
  p_dispatch_loot_ids => array['11830000-0000-4000-8000-0000000a0042'::uuid],
  p_move_party_to => '11830000-0000-4000-8000-0000000c0001'::uuid);

select is((select jsonb_array_length(payload -> 'transition_ids') from here_result), 2, 'party_here filled in the way there (A), then wrote the arrival at C');
select is((select payload ->> 'current_beat_id' from here_result), '11830000-0000-4000-8000-0000000a00b3', 'party_here places the cursor');
select ok(
  (select dispatched_at is not null from public.loot_placements where id = '11830000-0000-4000-8000-0000000a0042'),
  'the loot on C was dispatched'
);
select is(
  (select current_location_id from public.campaigns where id = '11830000-0000-4000-8000-000000000010'),
  '11830000-0000-4000-8000-0000000c0001'::uuid, 'the party moved to the place'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Undo of a played move behaves as `previous`.
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.transition_quest_runtime('11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-0000000b0001',
      pg_temp.main_thread('11830000-0000-4000-8000-0000000b0001'), 'start', 0, '11830000-0000-4000-8000-0000000b00b1')$$,
  'the party is played into P'
);
select lives_ok(
  $$select public.transition_quest_runtime('11830000-0000-4000-8000-000000000010', '11830000-0000-4000-8000-0000000b0001',
      pg_temp.main_thread('11830000-0000-4000-8000-0000000b0001'), 'advance', 1,
      p_edge_id => '11830000-0000-4000-8000-0000000b00e1')$$,
  'and advanced into X'
);
select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000b0021'),
  'pending', 'X raised OX'
);

create temporary table played_undo(payload jsonb);
grant all on played_undo to authenticated;
insert into played_undo select public.undo_quest_move(
  '11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000b0001'::uuid,
  pg_temp.main_thread('11830000-0000-4000-8000-0000000b0001'));

select is(
  (select status from public.quest_objectives where id = '11830000-0000-4000-8000-0000000b0021'),
  'dormant', 'undo of a played move unwound its consequence'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions
    where to_quest_id = '11830000-0000-4000-8000-0000000b0001' and transition_kind = 'previous'),
  1, 'by writing a `previous` transition, as the verb does'
);
select is((select payload ->> 'current_beat_id' from played_undo), '11830000-0000-4000-8000-0000000b00b1', 'and the cursor is back on P');

-- ════════════════════════════════════════════════════════════════════════════
-- Taking a parallel route by marking opens a thread of its own, as Advance does
-- at the table, and Undo with no thread named takes back the quest's newest
-- move, closing the thread that move opened.
-- ════════════════════════════════════════════════════════════════════════════

create temporary table par_move(payload jsonb);
grant all on par_move to authenticated;
insert into par_move select public.mark_quest_move(
  '11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid,
  pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001'), 'route',
  p_edge_id => '11830000-0000-4000-8000-0000000a00e2'::uuid);

select isnt(
  (select payload ->> 'thread_id' from par_move),
  pg_temp.main_thread('11830000-0000-4000-8000-0000000a0001')::text,
  'a marked parallel route records its move on a new thread, not the caller''s'
);
select is(
  (select label from public.quest_threads where id = (select (payload ->> 'thread_id')::uuid from par_move)),
  'Scouting', 'the new thread takes the route''s thread label'
);
select is(
  (select current_beat_id from public.quest_runtime_state where thread_id = (select (payload ->> 'thread_id')::uuid from par_move)),
  '11830000-0000-4000-8000-0000000a00b3'::uuid, 'and stands on the route''s target'
);

create temporary table par_undo(payload jsonb);
grant all on par_undo to authenticated;
insert into par_undo select public.undo_quest_move(
  '11830000-0000-4000-8000-000000000010'::uuid, '11830000-0000-4000-8000-0000000a0001'::uuid);

select is(
  (select payload ->> 'closed_thread_id' from par_undo),
  (select payload ->> 'thread_id' from par_move),
  'Undo with no thread takes back the quest''s newest move, on whichever thread it was'
);
select is(
  (select count(*)::integer from public.quest_threads where id = (select (payload ->> 'thread_id')::uuid from par_move)),
  0, 'and closes the thread that move opened'
);

select * from finish();
rollback;
