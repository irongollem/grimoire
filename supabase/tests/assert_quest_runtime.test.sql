begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

-- Cover for public.assert_quest_runtime (story #796, migration
-- 20260906093154_prep_can_assert_the_cursor.sql).
--
-- transition_quest_runtime is a play-time verb machine: every arrival is
-- stamped as happening now. assert_quest_runtime is the prep-time counterpart
-- — it appends `assert` transitions for a backfilled beat sequence, fires each
-- beat's consequences exactly as a played arrival would, and optionally moves
-- the cursor, all without pretending a session is running. The two behaviours
-- most worth pinning: it must never set status = 'running' (that lights the
-- session rail — fixing a record is not sitting down to play), and stepping
-- back with `previous` must keep unwinding the last real *arrival*, never an
-- assertion, even when an assertion is the most recent transition sitting on
-- top of it.

set local grimoire.bypass_quota = 'on';

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Signature, grants, and the unauthenticated path — run before anything in
--    this transaction sets a JWT claim, so auth.uid() is genuinely null here.
-- ════════════════════════════════════════════════════════════════════════════

select has_function(
  'public', 'assert_quest_runtime',
  array['uuid', 'uuid', 'uuid[]', 'boolean', 'text'],
  'assert_quest_runtime exists with the documented signature'
);

select ok(
  has_function_privilege('authenticated', 'public.assert_quest_runtime(uuid, uuid, uuid[], boolean, text)', 'EXECUTE'),
  'authenticated can execute assert_quest_runtime'
);

select ok(
  not has_function_privilege('anon', 'public.assert_quest_runtime(uuid, uuid, uuid[], boolean, text)', 'EXECUTE'),
  'anon has no grant at all — the function is off its RPC surface entirely'
);

select throws_ok(
  $$select public.assert_quest_runtime(
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      '{}'::uuid[])$$,
  'Authentication required',
  'a caller with no session is refused before any lookup — auth.uid() is checked first'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Fixtures shared by every scenario below.
-- ════════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('79600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assert796-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('79600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assert796-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- The owner of both campaigns is enrolled as DM by the campaigns' own trigger.
insert into public.campaigns (id, user_id, name) values
  ('79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-000000000001', 'Assert main'),
  ('79600000-0000-4000-8000-000000000011', '79600000-0000-4000-8000-000000000001', 'Assert other');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- A quest in the main campaign, with no beats — enough to pass the DM/quest
-- lookup gates for the authorization and empty-array scenarios below.
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000a0001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000010', 'Quest A');

-- A quest in the OTHER campaign, holding one beat that scenario D borrows as
-- "a beat from another quest".
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000b0001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000011', 'Quest B');
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000b0002', '79600000-0000-4000-8000-0000000b0001', '79600000-0000-4000-8000-000000000011', 'Foreign beat');

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Authorization — a non-DM member is refused, and a quest that belongs to
--    a different campaign than the one named is refused too.
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-0000000a0001'::uuid,
      '{}'::uuid[])$$,
  'Not authorized',
  'a campaign member who is not the DM cannot assert anything'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-0000000b0001'::uuid,
      '{}'::uuid[])$$,
  'P0002', 'Quest not found in this campaign',
  'a quest that belongs to a different campaign than the one named is refused'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Empty or null array raises 22023 rather than silently succeeding. Still
--    as the DM, on the valid (campaign, quest) pair from above.
-- ════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-0000000a0001'::uuid,
      null)$$,
  '22023', 'Nothing to assert',
  'a null beat array is refused'
);

select throws_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-0000000a0001'::uuid,
      '{}'::uuid[])$$,
  '22023', 'Nothing to assert',
  'an empty beat array is refused the same way a null one is'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. The whole array validates up front. A beat from another quest anywhere
--    in the array raises 23503 and leaves zero transitions recorded — a typo
--    mid-backfill must not leave half a session written.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000d0001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000010', 'Quest D');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('79600000-0000-4000-8000-0000000d0011', '79600000-0000-4000-8000-0000000d0001', '79600000-0000-4000-8000-000000000010', 'D1'),
  ('79600000-0000-4000-8000-0000000d0012', '79600000-0000-4000-8000-0000000d0001', '79600000-0000-4000-8000-000000000010', 'D2');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-0000000d0001'::uuid,
      array[
        '79600000-0000-4000-8000-0000000d0011'::uuid,
        '79600000-0000-4000-8000-0000000b0002'::uuid,
        '79600000-0000-4000-8000-0000000d0012'::uuid
      ])$$,
  '23503', 'Every asserted beat must belong to this quest',
  'a foreign beat anywhere in the array is refused, valid, foreign, valid'
);

select is(
  (select count(*)::integer from public.quest_beat_transitions
    where campaign_id = '79600000-0000-4000-8000-000000000010'
      and to_quest_id = '79600000-0000-4000-8000-0000000d0001'),
  0,
  'the failed validation left zero transitions behind — nothing half-written'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. The happy path on a never-played quest: beats assert in order, each
--    chains from the one before, a raise consequence on a dormant objective
--    fires, the cursor lands on the last beat, and the new runtime row is
--    born paused — never running.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000e0001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000010', 'Quest E');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('79600000-0000-4000-8000-0000000e0011', '79600000-0000-4000-8000-0000000e0001', '79600000-0000-4000-8000-000000000010', 'E1'),
  ('79600000-0000-4000-8000-0000000e0012', '79600000-0000-4000-8000-0000000e0001', '79600000-0000-4000-8000-000000000010', 'E2'),
  ('79600000-0000-4000-8000-0000000e0013', '79600000-0000-4000-8000-0000000e0001', '79600000-0000-4000-8000-000000000010', 'E3');
insert into public.quest_objectives (id, quest_id, description, status, sort_order)
values ('79600000-0000-4000-8000-0000000e0021', '79600000-0000-4000-8000-0000000e0001', 'A dormant thread', 'dormant', 1);
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('79600000-0000-4000-8000-0000000e0031', '79600000-0000-4000-8000-0000000e0001',
        '79600000-0000-4000-8000-0000000e0012', 'raise', '79600000-0000-4000-8000-0000000e0021');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

create temporary table assert_result_e(payload jsonb);
insert into assert_result_e
select public.assert_quest_runtime(
  '79600000-0000-4000-8000-000000000010'::uuid,
  '79600000-0000-4000-8000-0000000e0001'::uuid,
  array[
    '79600000-0000-4000-8000-0000000e0011'::uuid,
    '79600000-0000-4000-8000-0000000e0012'::uuid,
    '79600000-0000-4000-8000-0000000e0013'::uuid
  ],
  true, 'Backfilling session 1');

select is((select payload ->> 'asserted' from assert_result_e), '3', 'all three beats were recorded as asserted');
select is((select payload ->> 'current_beat_id' from assert_result_e), '79600000-0000-4000-8000-0000000e0013', 'the return value reports the cursor at the last beat');

select is(
  (select from_beat_id from public.quest_beat_transitions where to_beat_id = '79600000-0000-4000-8000-0000000e0011' and to_quest_id = '79600000-0000-4000-8000-0000000e0001'),
  null::uuid,
  'the first assertion chains from nothing — there was no prior cursor'
);
select is(
  (select from_beat_id from public.quest_beat_transitions where to_beat_id = '79600000-0000-4000-8000-0000000e0012' and to_quest_id = '79600000-0000-4000-8000-0000000e0001'),
  '79600000-0000-4000-8000-0000000e0011'::uuid,
  'the second assertion chains from the first beat'
);
select is(
  (select from_beat_id from public.quest_beat_transitions where to_beat_id = '79600000-0000-4000-8000-0000000e0013' and to_quest_id = '79600000-0000-4000-8000-0000000e0001'),
  '79600000-0000-4000-8000-0000000e0012'::uuid,
  'the third assertion chains from the second beat'
);

select is(
  (select status from public.quest_objectives where id = '79600000-0000-4000-8000-0000000e0021'),
  'pending',
  'asserting the beat carrying a raise consequence woke the dormant objective'
);

select is(
  (select status from public.quest_runtime_state where campaign_id = '79600000-0000-4000-8000-000000000010' and quest_id = '79600000-0000-4000-8000-0000000e0001'),
  'paused',
  'a quest with no prior runtime row is born paused, never running — fixing a record is not sitting down to play'
);
select is(
  (select current_beat_id from public.quest_runtime_state where campaign_id = '79600000-0000-4000-8000-000000000010' and quest_id = '79600000-0000-4000-8000-0000000e0001'),
  '79600000-0000-4000-8000-0000000e0013'::uuid,
  'the cursor was placed on the last asserted beat'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. An EXISTING runtime row keeps whatever status it had — including 'idle',
--    the state a quest sits in before anyone has ever pressed play. Asserting
--    moves the cursor without touching status at all.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000f0001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000010', 'Quest F');
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-0000000f0011', '79600000-0000-4000-8000-0000000f0001', '79600000-0000-4000-8000-000000000010', 'F1');
-- status defaults to 'idle' with no cursor — the natural resting state of a
-- quest nobody has started yet.
insert into public.quest_runtime_state (campaign_id, quest_id)
values ('79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-0000000f0001');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-0000000f0001'::uuid,
      array['79600000-0000-4000-8000-0000000f0011'::uuid])$$,
  'asserting onto an idle quest with an existing runtime row succeeds'
);

select is(
  (select status from public.quest_runtime_state where campaign_id = '79600000-0000-4000-8000-000000000010' and quest_id = '79600000-0000-4000-8000-0000000f0001'),
  'idle',
  'an existing row keeps whatever status it had — idle stays idle'
);
select is(
  (select current_beat_id from public.quest_runtime_state where campaign_id = '79600000-0000-4000-8000-000000000010' and quest_id = '79600000-0000-4000-8000-0000000f0001'),
  '79600000-0000-4000-8000-0000000f0011'::uuid,
  'the cursor moved even though status did not'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. `previous` still skips assertions. A beat is PLAYED into (its
--    consequence fires and is tied to a real arrival), then the same beat is
--    ASSERTED again on top (re-firing the now-idempotent consequence on a
--    newer, `assert`-kind transition). Stepping back must find the played
--    arrival to undo, not the assertion sitting more recently on the same
--    beat — that is the whole point of the transition_kind <> 'assert' filter
--    in transition_quest_runtime's undo lookup.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000010001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000010', 'Quest G');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('79600000-0000-4000-8000-000000010011', '79600000-0000-4000-8000-000000010001', '79600000-0000-4000-8000-000000000010', 'S'),
  ('79600000-0000-4000-8000-000000010012', '79600000-0000-4000-8000-000000010001', '79600000-0000-4000-8000-000000000010', 'X');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id)
values ('79600000-0000-4000-8000-000000010021', '79600000-0000-4000-8000-000000010001', '79600000-0000-4000-8000-000000000010',
        '79600000-0000-4000-8000-000000010011', '79600000-0000-4000-8000-000000010012');
insert into public.quest_objectives (id, quest_id, description, status, sort_order)
values ('79600000-0000-4000-8000-000000010031', '79600000-0000-4000-8000-000000010001', 'Wakes on arrival at X', 'dormant', 1);
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('79600000-0000-4000-8000-000000010041', '79600000-0000-4000-8000-000000010001',
        '79600000-0000-4000-8000-000000010012', 'raise', '79600000-0000-4000-8000-000000010031');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$select public.transition_quest_runtime(
      '79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-000000010001', 'start', 0,
      '79600000-0000-4000-8000-000000010011')$$,
  'the party plays into the start beat'
);
select lives_ok(
  $$select public.transition_quest_runtime(
      '79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-000000010001', 'advance', 1,
      p_edge_id => '79600000-0000-4000-8000-000000010021')$$,
  'and advances into X, a PLAYED arrival'
);
select is(
  (select status from public.quest_objectives where id = '79600000-0000-4000-8000-000000010031'),
  'pending',
  'the played arrival at X raised the dormant objective'
);

select lives_ok(
  $$select public.assert_quest_runtime(
      '79600000-0000-4000-8000-000000000010'::uuid,
      '79600000-0000-4000-8000-000000010001'::uuid,
      array['79600000-0000-4000-8000-000000010012'::uuid])$$,
  'the DM later re-asserts the same beat X — a correction layered on top of the real arrival'
);

select lives_ok(
  $$select public.transition_quest_runtime(
      '79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-000000010001', 'previous', 3)$$,
  'stepping back from X is allowed'
);

select is(
  (select status from public.quest_objectives where id = '79600000-0000-4000-8000-000000010031'),
  'dormant',
  'previous unwound the PLAYED arrival''s consequence, reverting past the assertion sitting on top of it'
);
select is(
  (select count(*)::integer from public.quest_consequence_events ev
    join public.quest_beat_transitions t on t.id = ev.transition_id
    where t.transition_kind = 'forward' and t.to_quest_id = '79600000-0000-4000-8000-000000010001' and ev.undone_at is not null),
  1,
  'the played (forward) transition''s event was the one marked undone'
);
select is(
  (select count(*)::integer from public.quest_consequence_events ev
    join public.quest_beat_transitions t on t.id = ev.transition_id
    where t.transition_kind = 'assert' and t.to_quest_id = '79600000-0000-4000-8000-000000010001' and ev.undone_at is not null),
  0,
  'the assertion''s own event was left untouched — previous skipped it entirely'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. p_place_cursor = false records the history — the transition and its
--    consequences — without moving the cursor or bumping the version.
-- ════════════════════════════════════════════════════════════════════════════

reset role;
insert into public.quests (id, user_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000020001', '79600000-0000-4000-8000-000000000001', '79600000-0000-4000-8000-000000000010', 'Quest H');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('79600000-0000-4000-8000-000000020011', '79600000-0000-4000-8000-000000020001', '79600000-0000-4000-8000-000000000010', 'P'),
  ('79600000-0000-4000-8000-000000020012', '79600000-0000-4000-8000-000000020001', '79600000-0000-4000-8000-000000000010', 'Qb');
insert into public.quest_objectives (id, quest_id, description, status, sort_order)
values ('79600000-0000-4000-8000-000000020021', '79600000-0000-4000-8000-000000020001', 'Revealed by Qb', 'dormant', 1);
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('79600000-0000-4000-8000-000000020031', '79600000-0000-4000-8000-000000020001',
        '79600000-0000-4000-8000-000000020012', 'reveal', '79600000-0000-4000-8000-000000020021');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '79600000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$select public.transition_quest_runtime(
      '79600000-0000-4000-8000-000000000010', '79600000-0000-4000-8000-000000020001', 'start', 0,
      '79600000-0000-4000-8000-000000020011')$$,
  'the party is playing, currently at P'
);

create temporary table assert_result_h(payload jsonb);
insert into assert_result_h
select public.assert_quest_runtime(
  '79600000-0000-4000-8000-000000000010'::uuid,
  '79600000-0000-4000-8000-000000020001'::uuid,
  array['79600000-0000-4000-8000-000000020012'::uuid],
  false, 'Prep note, do not move the party');

select is((select payload ->> 'cursor_placed' from assert_result_h), 'false', 'the return value reports the cursor was not placed');
select is((select payload ->> 'current_beat_id' from assert_result_h), '79600000-0000-4000-8000-000000020011', 'the return value still names the untouched cursor, P');

select is(
  (select current_beat_id from public.quest_runtime_state where campaign_id = '79600000-0000-4000-8000-000000000010' and quest_id = '79600000-0000-4000-8000-000000020001'),
  '79600000-0000-4000-8000-000000020011'::uuid,
  'the cursor in the database is still P — asserting Qb did not move it'
);
select is(
  (select version from public.quest_runtime_state where campaign_id = '79600000-0000-4000-8000-000000000010' and quest_id = '79600000-0000-4000-8000-000000020001'),
  1::bigint,
  'the runtime row''s version is untouched — no update was even attempted'
);
select is(
  (select from_beat_id from public.quest_beat_transitions where to_beat_id = '79600000-0000-4000-8000-000000020012' and to_quest_id = '79600000-0000-4000-8000-000000020001'),
  '79600000-0000-4000-8000-000000020011'::uuid,
  'the assertion still appended a transition chaining from the (unmoved) cursor to Qb'
);
select is(
  (select status from public.quest_objectives where id = '79600000-0000-4000-8000-000000020021'),
  'pending',
  'and its consequence still fired even though the cursor stayed put'
);

select * from finish();
rollback;
