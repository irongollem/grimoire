begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- Cover for the #852 rewrite of public.archive_quest_beat: a beat can now
-- have more than one thread standing on it, so the old single
-- p_expected_runtime_version/p_replacement_beat_id/p_end_runtime scalars gave
-- way to p_replacements ([{thread_id, beat_id}], beat_id null ends that
-- thread). Every thread whose cursor sits on the archived beat, read live
-- under lock at call time, must be named or the call is refused — which is
-- also the concurrency guard a version number used to provide.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('68700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue687-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000001', 'Atomic current archive');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values ('68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000001', 'dm', 'DM') on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title) values ('68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000001', '68700000-0000-4000-8000-000000000010', 'Quest');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('68700000-0000-4000-8000-000000000030', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', 'Current'),
  ('68700000-0000-4000-8000-000000000031', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', 'Replacement'),
  ('68700000-0000-4000-8000-000000000032', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', 'Later current');
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id) values ('68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000030', '68700000-0000-4000-8000-000000000031');

-- The Main thread every quest is born with (create_quest_main_thread) is the
-- one thread standing on the beat throughout scenarios 1-2.
insert into public.quest_runtime_state (campaign_id, quest_id, thread_id, current_beat_id, status, version, visit_stack, visit_index)
select '68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000020', t.id,
  '68700000-0000-4000-8000-000000000030', 'running', 3,
  '[{"beat_id":"68700000-0000-4000-8000-000000000030"}]'::jsonb, 0
from public.quest_threads t
where t.quest_id = '68700000-0000-4000-8000-000000000020' and t.label = 'Main';

set local role authenticated;
select set_config('request.jwt.claim.sub', '68700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── 1. No replacement named for the thread standing there ───────────────────

select throws_ok(
  $$ select public.archive_quest_beat('68700000-0000-4000-8000-000000000030') $$,
  '23514', null, 'a thread standing on the beat with no replacement is refused'
);
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000030'), 'neutral', 'rejected removal leaves beat authored');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '68700000-0000-4000-8000-000000000010'), 0, 'rejected removal adds no history');

-- ── 2. A replacement beat moves the thread's cursor and archive commits ─────

select lives_ok(
  $$ select public.archive_quest_beat(
    '68700000-0000-4000-8000-000000000030',
    jsonb_build_array(jsonb_build_object(
      'thread_id', (select id from public.quest_threads where quest_id = '68700000-0000-4000-8000-000000000020' and label = 'Main'),
      'beat_id', '68700000-0000-4000-8000-000000000031'
    ))
  ) $$,
  'current beat relocation and archive commit together'
);
select is(
  (select current_beat_id from public.quest_runtime_state
    where campaign_id = '68700000-0000-4000-8000-000000000010' and quest_id = '68700000-0000-4000-8000-000000000020'),
  '68700000-0000-4000-8000-000000000031'::uuid, 'cursor moves to replacement'
);
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000030'), 'archived', 'former current beat is archived');
select is((select count(*)::integer from public.quest_beat_edges where source_beat_id = '68700000-0000-4000-8000-000000000030'), 0, 'former current routes are detached');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '68700000-0000-4000-8000-000000000010'), 1, 'successful relocation adds exactly one history row');

-- ── 3. A second thread parked on the next beat and left uncovered ───────────
--
-- The old file tested a stale p_expected_runtime_version. That scalar cannot
-- describe "every thread on this beat" once a beat can hold more than one, so
-- concurrency is now enforced by reading the live set of threads under lock at
-- call time: a thread the caller's replacements list does not know about is
-- caught right here, as the same 23514 scenario 1 already covers.

-- quest_runtime_state has no client write grant at all (#796), so this direct
-- fixture insert — simulating a thread that arrived after the caller loaded
-- its replacements list — runs as postgres, not authenticated.
reset role;
insert into public.quest_threads (campaign_id, quest_id, label, status, created_by)
values ('68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000020', 'Side errand', 'live', '68700000-0000-4000-8000-000000000001');
insert into public.quest_runtime_state (campaign_id, quest_id, thread_id, current_beat_id, status, version, visit_stack, visit_index)
select '68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000020', t.id,
  '68700000-0000-4000-8000-000000000031', 'running', 1,
  '[{"beat_id":"68700000-0000-4000-8000-000000000031"}]'::jsonb, 0
from public.quest_threads t
where t.quest_id = '68700000-0000-4000-8000-000000000020' and t.label = 'Side errand';

set local role authenticated;
select set_config('request.jwt.claim.sub', '68700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.archive_quest_beat('68700000-0000-4000-8000-000000000031') $$,
  '23514', null, 'a second thread now standing on the beat and left uncovered is refused just the same'
);
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000031'), 'neutral', 'the uncovered-thread refusal leaves the beat authored');

-- ── 4. A replacement from another quest cannot hijack this chain's cursor ───

insert into public.quests (id, user_id, campaign_id, title) values ('68700000-0000-4000-8000-000000000021', '68700000-0000-4000-8000-000000000001', '68700000-0000-4000-8000-000000000010', 'Other chain');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('68700000-0000-4000-8000-000000000033', '68700000-0000-4000-8000-000000000021', '68700000-0000-4000-8000-000000000010', 'Elsewhere');

select throws_ok(
  $$ select public.archive_quest_beat(
    '68700000-0000-4000-8000-000000000031',
    jsonb_build_array(jsonb_build_object(
      'thread_id', (select id from public.quest_threads where quest_id = '68700000-0000-4000-8000-000000000020' and label = 'Main'),
      'beat_id', '68700000-0000-4000-8000-000000000033'
    ), jsonb_build_object(
      'thread_id', (select id from public.quest_threads where quest_id = '68700000-0000-4000-8000-000000000020' and label = 'Side errand'),
      'beat_id', '68700000-0000-4000-8000-000000000033'
    ))
  ) $$,
  '22023', 'Replacement beat not found or not usable',
  'a replacement from another quest cannot hijack this chain''s cursor'
);

-- ── 5. beat_id: null ends the thread instead of relocating it ──────────────

select lives_ok(
  $$ select public.archive_quest_beat(
    '68700000-0000-4000-8000-000000000031',
    jsonb_build_array(jsonb_build_object(
      'thread_id', (select id from public.quest_threads where quest_id = '68700000-0000-4000-8000-000000000020' and label = 'Main'),
      'beat_id', null
    ), jsonb_build_object(
      'thread_id', (select id from public.quest_threads where quest_id = '68700000-0000-4000-8000-000000000020' and label = 'Side errand'),
      'beat_id', null
    ))
  ) $$,
  'a null beat_id ends the thread rather than relocating it'
);
select is(
  (select status from public.quest_runtime_state
    where campaign_id = '68700000-0000-4000-8000-000000000010' and quest_id = '68700000-0000-4000-8000-000000000020'
      and thread_id = (select id from public.quest_threads where quest_id = '68700000-0000-4000-8000-000000000020' and label = 'Main')),
  'ended', 'the Main thread was ended rather than relocated'
);
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000031'), 'archived', 'the beat both threads stood on is archived once both are covered');

select * from finish();
rollback;
