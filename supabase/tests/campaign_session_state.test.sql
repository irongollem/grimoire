begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

-- ── Shape ────────────────────────────────────────────────────────────────────

select has_table('public', 'campaign_session_state', 'the session is a row, not a browser string');
select has_function('public', 'start_campaign_session', array['uuid'], 'starting the table is a command');
select has_function('public', 'end_campaign_session', array['uuid'], 'closing the table is a command');
select col_is_unique('public', 'campaign_session_state', array['campaign_id'],
  'one live session per campaign — two rows claiming to be it is unresolvable');
select has_column('public', 'campaign_session_state', 'started_at',
  'a session describes a span, which is what makes a stale one visible');
select has_column('public', 'encounter_state', 'session_id', 'an encounter records the session it ran in');
select has_function('public', 'get_player_session_state', array['uuid'], 'players read the session through a projection, never the row');

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('75800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue758-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('75800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue758-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('75800000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue758-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('75800000-0000-4000-8000-000000000010', '75800000-0000-4000-8000-000000000001', 'Session campaign');

-- A player *member* as well as a total outsider: the guard has to deny both,
-- and only one of them is the interesting case. A member is inside every
-- campaign-scoped read path already, so "is a member" is exactly the mistake a
-- DM-only command is one predicate away from making.
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('75800000-0000-4000-8000-000000000010', '75800000-0000-4000-8000-000000000001', 'dm', 'Session DM'),
  ('75800000-0000-4000-8000-000000000010', '75800000-0000-4000-8000-000000000002', 'player', 'Session player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title) values
  ('75800000-0000-4000-8000-000000000020', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-000000000010', 'Open chain');

insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, is_improvised) values
  ('75800000-0000-4000-8000-000000000030', '75800000-0000-4000-8000-000000000020', '75800000-0000-4000-8000-000000000010', 'A', 'hidden', false);

insert into public.encounters (id, user_id, campaign_id, name)
values ('75800000-0000-4000-8000-000000000040', '75800000-0000-4000-8000-000000000001', '75800000-0000-4000-8000-000000000010', 'Goblin ambush');

-- ── The DM's own session ─────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((public.start_campaign_session('75800000-0000-4000-8000-000000000010')).is_running,
  true, 'starting a session marks it live');
select isnt((select started_at from public.campaign_session_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'), null,
  'a started session stamps when it started');

-- Reopening the app mid-session must not restart the clock. A DM who refreshes
-- at 22:40 should still see the session they began at 20:00, or the elapsed
-- time is decoration rather than information.
-- Backdated rather than compared against a second call, because `now()` is the
-- *transaction* clock and this file is one transaction: a preserved stamp and a
-- freshly written one would be the same value, and both assertions would pass
-- while proving nothing. A stamp left in 2020 was genuinely preserved.
update public.campaign_session_state
set started_at = timestamptz '2020-01-01 20:00+00'
where campaign_id = '75800000-0000-4000-8000-000000000010';
select public.start_campaign_session('75800000-0000-4000-8000-000000000010');
select is((select started_at from public.campaign_session_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'),
  timestamptz '2020-01-01 20:00+00',
  're-starting a running session preserves its original started_at');

-- ── Ending the session ends what it contains ─────────────────────────────────

insert into public.encounter_state (encounter_id, campaign_id, user_id, is_running, started_at)
values ('75800000-0000-4000-8000-000000000040', '75800000-0000-4000-8000-000000000010',
        '75800000-0000-4000-8000-000000000001', true, now());

select public.transition_quest_runtime(
  '75800000-0000-4000-8000-000000000010', '75800000-0000-4000-8000-000000000020', 'start', 0,
  '75800000-0000-4000-8000-000000000030');

select is((select status from public.quest_runtime_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'
    and quest_id = '75800000-0000-4000-8000-000000000020'), 'running',
  'the chain is open before the table closes');

select set_config('grimoire.test_end', (public.end_campaign_session('75800000-0000-4000-8000-000000000010'))::text, true);

select is((current_setting('grimoire.test_end')::jsonb ->> 'encounters_ended')::integer, 1,
  'ending the session reports the combat it stopped');
select is((current_setting('grimoire.test_end')::jsonb ->> 'chains_paused')::integer, 1,
  'ending the session reports the chains it paused');
select is((select is_running from public.campaign_session_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'), false,
  'the session is no longer live');
select isnt((select ended_at from public.campaign_session_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'), null,
  'a closed session stamps when it ended');

-- The reaper. An encounter left `is_running` because the DM shut the laptop had
-- nothing to clear it before this existed, so it stayed live indefinitely.
select is((select is_running from public.encounter_state
  where encounter_id = '75800000-0000-4000-8000-000000000040'), false,
  'ending the session stops a combat the DM never closed');

-- Paused, never cleared: the position is the thing worth keeping, and #755
-- exists because the old campaign-wide `end` discarded it.
select is((select status from public.quest_runtime_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'
    and quest_id = '75800000-0000-4000-8000-000000000020'), 'paused',
  'ending the session pauses the chain rather than ending it');
select is((select current_beat_id from public.quest_runtime_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'
    and quest_id = '75800000-0000-4000-8000-000000000020'),
  '75800000-0000-4000-8000-000000000030'::uuid,
  'a paused chain keeps the beat it was standing on');
select is((select count(*)::integer from public.quest_beat_transitions
  where campaign_id = '75800000-0000-4000-8000-000000000010' and reason = 'Session ended'), 1,
  'the pause is logged, so the session record stays readable');

-- Starting again after an end is a new session, and gets a new clock.
update public.campaign_session_state
set started_at = timestamptz '2020-01-01 20:00+00'
where campaign_id = '75800000-0000-4000-8000-000000000010';
select public.start_campaign_session('75800000-0000-4000-8000-000000000010');
select isnt((select started_at from public.campaign_session_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'),
  timestamptz '2020-01-01 20:00+00',
  'a session started after an end gets its own clock');
select is((select ended_at from public.campaign_session_state
  where campaign_id = '75800000-0000-4000-8000-000000000010'), null,
  'restarting clears the previous end');

-- ── The player projection ────────────────────────────────────────────────────

-- Players cannot see `campaign_session_state` at all — the policy is DM-only,
-- and this projection is what tells them the table is sitting. It must hand
-- back strictly less than the row.

select public.start_campaign_session('75800000-0000-4000-8000-000000000010');

select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000002', true);

select is((select count(*)::integer from public.campaign_session_state), 0,
  'a player still cannot read the session row itself');
select is((select is_running from public.get_player_session_state('75800000-0000-4000-8000-000000000010')),
  true, 'a player can learn that the table is sitting');
select isnt((select started_at from public.get_player_session_state('75800000-0000-4000-8000-000000000010')),
  null, 'a player learns since when, so the portal can say how long');
select is(
  (select count(*)::integer
   from information_schema.columns
   where table_name = 'campaign_session_state' and column_name in ('user_id', 'ended_at')),
  2, 'the row carries user_id and ended_at…');
select ok(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_player_session_state'
      and (pg_get_function_result(p.oid) like '%user_id%' or pg_get_function_result(p.oid) like '%ended_at%')
  ),
  '…and the projection hands back neither');

-- An ended session is not a running one, and the projection says nothing rather
-- than returning a row with is_running false — a player asks one question.
select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000001', true);
select public.end_campaign_session('75800000-0000-4000-8000-000000000010');
select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.get_player_session_state('75800000-0000-4000-8000-000000000010')),
  0, 'a closed session projects nothing at all');

-- Membership is the gate, not DM-ness — but a stranger is still a stranger.
select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.get_player_session_state('75800000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a non-member cannot ask whether someone else''s table is sitting');

-- ── Authorization ────────────────────────────────────────────────────────────

-- A player is a campaign member, so every membership-scoped predicate says yes
-- to them. Only the DM predicate says no, which is the whole reason this is
-- gated on `is_campaign_dm` and not `is_campaign_member`.
select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.start_campaign_session('75800000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a player cannot start the table''s session');
select throws_ok(
  $$ select public.end_campaign_session('75800000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a player cannot close the table');
select is((select count(*)::integer from public.campaign_session_state), 0,
  'a player cannot read whether a session is running');

select set_config('request.jwt.claim.sub', '75800000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.end_campaign_session('75800000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a stranger cannot close someone else''s table');

-- The guard must be total. `private.is_campaign_dm` answers from `exists(...)`
-- so it returns false rather than NULL for an absent membership — the failure
-- that let `if not private.is_app_admin()` fall through five functions at once.
select ok(private.is_campaign_dm('75800000-0000-4000-8000-000000000010') is not null,
  'the DM predicate answers false for a non-member, never NULL');

select * from finish();
rollback;
