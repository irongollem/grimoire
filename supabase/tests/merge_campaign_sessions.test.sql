begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- merge_campaign_sessions (20261006151947): two log rows for one evening, the
-- run and the written-up recap, become one row carrying both.

-- ── Every link into the log is one the merge moves ──────────────────────────
-- The function lists these by hand; a new foreign key into campaign_sessions
-- fails here until the merge moves it too.

select set_eq(
  $$ select c.conrelid::regclass::text from pg_constraint c
      where c.contype = 'f' and c.confrelid = 'public.campaign_sessions'::regclass $$,
  array['notes', 'session_proposals', 'encounter_state', 'npc_reveals', 'location_reveals',
        'handout_reveals', 'discovered_monsters', 'quest_beat_transitions'],
  'the merge moves every link into the session log'
);

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('98600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-merge-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-merge-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98600000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-merge-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('98600000-0000-4000-8000-000000000010', '98600000-0000-4000-8000-000000000001', 'Merged'),
  ('98600000-0000-4000-8000-000000000011', '98600000-0000-4000-8000-000000000003', 'Elsewhere');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('98600000-0000-4000-8000-000000000010', '98600000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('98600000-0000-4000-8000-000000000010', '98600000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('98600000-0000-4000-8000-000000000011', '98600000-0000-4000-8000-000000000003', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- The evening as it was run (the clock, an encounter) and as it was written up
-- (a title, the recap note, the scheduled session it was).
insert into public.campaign_sessions (id, campaign_id, user_id, number, title, played_on, started_at, ended_at) values
  ('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000010', '98600000-0000-4000-8000-000000000001',
   14, null, null, timestamptz '2026-10-02 18:00+00', timestamptz '2026-10-02 23:20+00'),
  ('98600000-0000-4000-8000-000000000021', '98600000-0000-4000-8000-000000000010', '98600000-0000-4000-8000-000000000001',
   14, 'The Wolves of Dougan''s Hole', date '2026-10-02', null, null),
  -- Running now: never merged.
  ('98600000-0000-4000-8000-000000000022', '98600000-0000-4000-8000-000000000010', '98600000-0000-4000-8000-000000000001',
   15, null, null, now(), null),
  -- Another campaign's session.
  ('98600000-0000-4000-8000-000000000023', '98600000-0000-4000-8000-000000000011', '98600000-0000-4000-8000-000000000003',
   14, 'Theirs', date '2026-10-02', null, null);

insert into public.notes (id, user_id, campaign_id, title, category, session_id)
values ('98600000-0000-4000-8000-000000000030', '98600000-0000-4000-8000-000000000001', '98600000-0000-4000-8000-000000000010',
        'Recap', 'session', '98600000-0000-4000-8000-000000000021');
insert into public.session_proposals (id, user_id, campaign_id, proposed_date, title, session_id)
values ('98600000-0000-4000-8000-000000000040', '98600000-0000-4000-8000-000000000001', '98600000-0000-4000-8000-000000000010',
        date '2026-10-02', 'Wolves', '98600000-0000-4000-8000-000000000021');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Refusals ─────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98600000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.merge_campaign_sessions('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000021') $$,
  'Not authorized', 'a player cannot merge sessions');

select set_config('request.jwt.claim.sub', '98600000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.merge_campaign_sessions('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000021') $$,
  'Not authorized', 'nor can the DM of another campaign');
select throws_ok(
  $$ select public.merge_campaign_sessions('98600000-0000-4000-8000-000000000023', '98600000-0000-4000-8000-000000000021') $$,
  'Not authorized', 'nor pull another campaign''s session into theirs');

select set_config('request.jwt.claim.sub', '98600000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.merge_campaign_sessions('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000023') $$,
  'Not authorized', 'the DM cannot reach across campaigns either');
select throws_ok(
  $$ select public.merge_campaign_sessions('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000022') $$,
  'End the running session before merging it', 'the running session is never merged');
select throws_ok(
  $$ select public.merge_campaign_sessions('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000020') $$,
  'A session cannot be merged into itself', 'nor a session into itself');

-- ── The merge (positive control) ─────────────────────────────────────────────

select is(
  (public.merge_campaign_sessions('98600000-0000-4000-8000-000000000020', '98600000-0000-4000-8000-000000000021')).title,
  'The Wolves of Dougan''s Hole', 'the kept session takes the title it lacked');
select is((select count(*)::integer from public.campaign_sessions where id = '98600000-0000-4000-8000-000000000021'), 0,
  'the absorbed session is gone');
select is((select started_at from public.campaign_sessions where id = '98600000-0000-4000-8000-000000000020'),
  timestamptz '2026-10-02 18:00+00', 'the run is kept');
select is((select played_on from public.campaign_sessions where id = '98600000-0000-4000-8000-000000000020'),
  date '2026-10-02', 'and the evening it was played');
select is((select session_id from public.notes where id = '98600000-0000-4000-8000-000000000030'),
  '98600000-0000-4000-8000-000000000020'::uuid, 'the recap note follows');
select is((select session_id from public.session_proposals where id = '98600000-0000-4000-8000-000000000040'),
  '98600000-0000-4000-8000-000000000020'::uuid, 'and so does the scheduled session');
-- Read as the owner: RLS hides another campaign's row from this DM either way.
reset role;
select is((select count(*)::integer from public.campaign_sessions where id = '98600000-0000-4000-8000-000000000023'), 1,
  'another campaign''s session is untouched');

select * from finish();
rollback;
