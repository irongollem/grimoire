begin;

create extension if not exists pgtap with schema extensions;
select plan(41);

-- The session log (#985, 20261006072708 + 20261006072853). A session is a row
-- in a log: a DM-given number that is a label (repeats allowed), an optional
-- title, a span when it ran, the note written about it, and everything the
-- party learned during it.

-- ── Shape ────────────────────────────────────────────────────────────────────

select has_table('public', 'campaign_sessions', 'a session is a row in a log');
select hasnt_table('public', 'campaign_session_state', 'the overwritten single row is gone');
select has_function('public', 'start_campaign_session', array['uuid', 'integer', 'text', 'uuid'], 'start says which session it is');
select has_function('public', 'end_campaign_session', array['uuid'], 'closing the table is a command');
select has_function('public', 'get_player_sessions', array['uuid'], 'players read past sessions through a projection');
select hasnt_column('public', 'notes', 'session_num', 'the number lives on the session, not the note');
select has_column('public', 'notes', 'session_id', 'a session note links to its session');

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('98500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'log-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98500000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'log-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98500000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'log-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('98500000-0000-4000-8000-000000000010', '98500000-0000-4000-8000-000000000001', 'Logged');

insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('98500000-0000-4000-8000-000000000030', '98500000-0000-4000-8000-000000000002', '98500000-0000-4000-8000-000000000010', 'Wren', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('98500000-0000-4000-8000-000000000010', '98500000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('98500000-0000-4000-8000-000000000010', '98500000-0000-4000-8000-000000000002', 'player', 'Player', '98500000-0000-4000-8000-000000000030')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.quests (id, user_id, campaign_id, title) values
  ('98500000-0000-4000-8000-000000000020', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', 'Open chain');
insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, is_improvised) values
  ('98500000-0000-4000-8000-000000000021', '98500000-0000-4000-8000-000000000020', '98500000-0000-4000-8000-000000000010', 'A', 'hidden', false);
insert into public.encounters (id, user_id, campaign_id, name)
values ('98500000-0000-4000-8000-000000000040', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', 'Ambush');
insert into public.session_proposals (id, user_id, campaign_id, proposed_date, title)
values ('98500000-0000-4000-8000-000000000050', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', current_date, 'Into the Mere');

insert into public.npcs (id, user_id, campaign_id, name, player_visible_to, player_visible_fields) values
  ('98500000-0000-4000-8000-000000000060', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', 'Met in play', '{}'::uuid[], array['name']),
  ('98500000-0000-4000-8000-000000000061', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', 'Met in prep', '{}'::uuid[], array['name']);
insert into public.locations (id, user_id, campaign_id, name)
values ('98500000-0000-4000-8000-000000000070', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', 'The Inn');
insert into public.scriptorium_documents (id, user_id, campaign_id, title)
values ('98500000-0000-4000-8000-000000000080', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010', 'A letter');

-- ── Starting ─────────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Shared during prep, before the session starts.
update public.npcs set player_visible_to = array['98500000-0000-4000-8000-000000000030']::uuid[]
 where id = '98500000-0000-4000-8000-000000000061';
select is((select session_id from public.npc_reveals where npc_id = '98500000-0000-4000-8000-000000000061'),
  null, 'a share while no session is open belongs to none yet');

select is((public.start_campaign_session('98500000-0000-4000-8000-000000000010', 15, ' Into the Mere ', '98500000-0000-4000-8000-000000000050')).number,
  15, 'the DM says which session it is');
select set_config('grimoire.s15', (select id::text from public.campaign_sessions where number = 15), true);
select is((select title from public.campaign_sessions where number = 15), 'Into the Mere', 'the title is trimmed');
select is((select session_id::text from public.session_proposals where id = '98500000-0000-4000-8000-000000000050'),
  current_setting('grimoire.s15'), 'the scheduled session points at the session it became');
select is((select session_id::text from public.npc_reveals where npc_id = '98500000-0000-4000-8000-000000000061'),
  current_setting('grimoire.s15'), 'what was shared during prep joins the session started next');

-- Re-starting returns the open session and keeps its clock (backdated so the
-- comparison means something inside one transaction).
update public.campaign_sessions set started_at = timestamptz '2026-10-05 19:30+00'
 where id = current_setting('grimoire.s15')::uuid;
select is((public.start_campaign_session('98500000-0000-4000-8000-000000000010', 99, 'ignored', null)).number,
  15, 're-starting while one is open returns the open session');
select is((select started_at from public.campaign_sessions where id = current_setting('grimoire.s15')::uuid),
  timestamptz '2026-10-05 19:30+00', 'and keeps its clock');
select is((select count(*)::integer from public.campaign_sessions where campaign_id = '98500000-0000-4000-8000-000000000010'),
  1, 'and makes no second row');

select throws_ok(
  $$ insert into public.campaign_sessions (campaign_id, started_at) values ('98500000-0000-4000-8000-000000000010', now()) $$,
  '23505', null, 'two open sessions in one campaign are refused');

-- ── During play ──────────────────────────────────────────────────────────────

update public.npcs set player_visible_to = array['98500000-0000-4000-8000-000000000030']::uuid[]
 where id = '98500000-0000-4000-8000-000000000060';
select is((select session_id::text from public.npc_reveals where npc_id = '98500000-0000-4000-8000-000000000060'),
  current_setting('grimoire.s15'), 'a person met during play belongs to the open session');

update public.locations set player_visible_to = array['98500000-0000-4000-8000-000000000030']::uuid[]
 where id = '98500000-0000-4000-8000-000000000070';
select is((select session_id::text from public.location_reveals where location_id = '98500000-0000-4000-8000-000000000070'),
  current_setting('grimoire.s15'), 'a place shared during play is recorded, in the open session');

update public.scriptorium_documents set player_visible_to = array['98500000-0000-4000-8000-000000000030']::uuid[]
 where id = '98500000-0000-4000-8000-000000000080';
select is((select session_id::text from public.handout_reveals where document_id = '98500000-0000-4000-8000-000000000080'),
  current_setting('grimoire.s15'), 'a handout shared during play is recorded, in the open session');

insert into public.encounter_state (encounter_id, campaign_id, user_id, is_running, started_at, session_id)
values ('98500000-0000-4000-8000-000000000040', '98500000-0000-4000-8000-000000000010',
        '98500000-0000-4000-8000-000000000001', true, now(), current_setting('grimoire.s15')::uuid);
select public.transition_quest_runtime(
  '98500000-0000-4000-8000-000000000010', '98500000-0000-4000-8000-000000000020',
  (select id from public.quest_threads where quest_id = '98500000-0000-4000-8000-000000000020' and label = 'Main'),
  'start', 0, '98500000-0000-4000-8000-000000000021');
select is((select session_id::text from public.quest_beat_transitions where campaign_id = '98500000-0000-4000-8000-000000000010' order by seq limit 1),
  current_setting('grimoire.s15'), 'a quest step taken during play belongs to the open session');

-- ── The player's view ────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.campaign_sessions), 0, 'a player cannot read the session rows');
select is((select number from public.get_player_session_state('98500000-0000-4000-8000-000000000010')),
  15, 'a player learns which session is running');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('get_player_session_state', 'get_player_sessions')
    and pg_get_function_result(p.oid) like '%user_id%'),
  'neither projection hands back who started a session');
select is((select title from public.get_player_sessions('98500000-0000-4000-8000-000000000010')),
  'Into the Mere', 'a player reads past session labels');
select is((select count(*)::integer from public.location_reveals), 1, 'a player reads their own place reveals');
update public.npc_reveals set session_id = null where npc_id = '98500000-0000-4000-8000-000000000060';
select is((select session_id::text from public.npc_reveals where npc_id = '98500000-0000-4000-8000-000000000060'),
  current_setting('grimoire.s15'), 'a player cannot move a learned moment (the DM-only policy filters it out)');
select throws_ok(
  $$ select public.start_campaign_session('98500000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a player cannot start a session');
select throws_ok(
  $$ select public.end_campaign_session('98500000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a player cannot end one');

select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.get_player_sessions('98500000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a stranger cannot read a campaign''s sessions');
select throws_ok(
  $$ select * from public.get_player_session_state('98500000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'nor whether its table is sitting');

-- ── Ending ───────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000001', true);
select set_config('grimoire.end', (public.end_campaign_session('98500000-0000-4000-8000-000000000010'))::text, true);
select is((current_setting('grimoire.end')::jsonb ->> 'encounters_ended')::integer, 1, 'ending stops the combat');
select is((current_setting('grimoire.end')::jsonb ->> 'chains_paused')::integer, 1, 'ending pauses the open chain');
select isnt((select ended_at from public.campaign_sessions where id = current_setting('grimoire.s15')::uuid),
  null, 'the session records when it ended');

select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.get_player_session_state('98500000-0000-4000-8000-000000000010')),
  0, 'a closed session projects nothing');
select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000001', true);

-- A second session, deliberately numbered like an earlier one: labels repeat.
select public.start_campaign_session('98500000-0000-4000-8000-000000000010', 15, 'Into the Mere, again', null);
select is((select count(*)::integer from public.campaign_sessions where number = 15), 2,
  'two sessions can share a number');
select public.end_campaign_session('98500000-0000-4000-8000-000000000010');

-- An unnumbered test start.
select is((public.start_campaign_session('98500000-0000-4000-8000-000000000010')).number, null,
  'a session may start with no number');
select public.end_campaign_session('98500000-0000-4000-8000-000000000010');

-- ── Corrections and notes ────────────────────────────────────────────────────

select lives_ok(
  $$ update public.npc_reveals set session_id = null where npc_id = '98500000-0000-4000-8000-000000000060' $$,
  'the DM can move a learned moment out of a session');
select throws_ok(
  $$ update public.npc_reveals set revealed_at = now() where npc_id = '98500000-0000-4000-8000-000000000060' $$,
  '42501', null, 'but cannot rewrite when it happened');

insert into public.notes (id, user_id, campaign_id, title, category, session_id)
values ('98500000-0000-4000-8000-000000000090', '98500000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000010',
        'Recap', 'session', current_setting('grimoire.s15')::uuid);
select is((select s.number from public.notes n join public.campaign_sessions s on s.id = n.session_id
            where n.id = '98500000-0000-4000-8000-000000000090'), 15, 'a session note reads its number through its session');

delete from public.campaign_sessions where id = current_setting('grimoire.s15')::uuid;
select is((select session_id from public.notes where id = '98500000-0000-4000-8000-000000000090'), null,
  'deleting a session keeps its note, unlinked');
select is((select count(*)::integer from public.npc_reveals where npc_id = '98500000-0000-4000-8000-000000000061'), 1,
  'and what the party learned stays learned');

select * from finish();
rollback;
