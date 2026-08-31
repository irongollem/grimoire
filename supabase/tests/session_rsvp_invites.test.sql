begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

-- Cover for the mail-app RSVP path (20260831082156).
--
-- Two properties carry the whole design and both are easy to lose to a later
-- "tidy-up": the token must not be readable from the browser by anyone, DM
-- included, and the three RPCs must refuse a caller who is not service_role
-- even when they hold EXECUTE. Everything else here guards the answer being
-- recorded for the right person.

-- ── Shape ────────────────────────────────────────────────────────────────────

select has_table('public', 'session_proposal_invites', 'an invitation is a row, so it can be revoked with its proposal');
select col_is_unique('public', 'session_proposal_invites', array['token'],
  'a token names one invitation — two would answer for two people at once');
select col_is_unique('public', 'session_proposal_invites', array['session_proposal_id', 'user_id'],
  'one invitation per player per date, so re-sending bumps a sequence instead of forking the token');
select has_function('public', 'issue_session_rsvp_invites', array['uuid', 'uuid[]'], 'tokens are minted by an RPC');
select has_function('public', 'get_session_rsvp_invite', array['uuid'], 'the confirmation page reads through an RPC');
select has_function('public', 'record_session_rsvp', array['uuid', 'boolean'], 'the answer is written by an RPC');

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('7a5a0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rsvp-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('7a5a0000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rsvp-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('7a5a0000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rsvp-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('7a5a0000-0000-4000-8000-000000000010', '7a5a0000-0000-4000-8000-000000000001', 'RSVP campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('7a5a0000-0000-4000-8000-000000000010', '7a5a0000-0000-4000-8000-000000000001', 'dm', 'RSVP DM'),
  ('7a5a0000-0000-4000-8000-000000000010', '7a5a0000-0000-4000-8000-000000000002', 'player', 'RSVP player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.session_proposals (id, campaign_id, user_id, proposed_date, proposed_time, title, status)
values
  ('7a5a0000-0000-4000-8000-000000000020', '7a5a0000-0000-4000-8000-000000000010',
   '7a5a0000-0000-4000-8000-000000000001', current_date + 7, '19:30', 'Session 12', 'proposed'),
  ('7a5a0000-0000-4000-8000-000000000021', '7a5a0000-0000-4000-8000-000000000010',
   '7a5a0000-0000-4000-8000-000000000001', current_date + 14, '19:30', 'Session 13', 'cancelled');

-- ── The three RPCs refuse a non-service_role caller ──────────────────────────
-- EXECUTE is revoked from authenticated as well, but a revoke is one migration
-- away from being undone by a drop-and-create (see anon_rpc_surface.test.sql).
-- So the guard is asserted from the service_role grant's *inside*: set the
-- claims to an ordinary user while keeping the superuser session, which is what
-- a restored grant would look like.

select set_config('request.jwt.claims',
  '{"sub":"7a5a0000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select public.issue_session_rsvp_invites('7a5a0000-0000-4000-8000-000000000020', array['7a5a0000-0000-4000-8000-000000000002'::uuid]) $$,
  'issue_session_rsvp_invites can only be called by service_role',
  'a logged-in player cannot mint themselves a token');

select throws_ok(
  $$ select public.get_session_rsvp_invite('7a5a0000-0000-4000-8000-0000000000ff') $$,
  'get_session_rsvp_invite can only be called by service_role',
  'a logged-in player cannot enumerate invitations');

select throws_ok(
  $$ select public.record_session_rsvp('7a5a0000-0000-4000-8000-0000000000ff', true) $$,
  'record_session_rsvp can only be called by service_role',
  'a logged-in player cannot answer through the RPC directly');

-- ── The table is invisible from the browser, to everyone ─────────────────────
-- RLS is on with no policies. The DM case is the one that matters: a DM who
-- could read these tokens could accept on behalf of every player at the table.

select is_empty(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'session_proposal_invites' $$,
  'the table carries no policies at all — the absence is the lockdown, not an oversight');

select is(
  (select relrowsecurity from pg_class where oid = 'public.session_proposal_invites'::regclass),
  true,
  'row level security is enabled, so no-policies means deny-all rather than wide open');

-- ── Issuing ──────────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select count(*)::int from public.issue_session_rsvp_invites(
     '7a5a0000-0000-4000-8000-000000000020',
     array['7a5a0000-0000-4000-8000-000000000002'::uuid])),
  1,
  'a campaign member named in the request gets exactly one token');

-- The caller passes ids as a hint; membership is re-derived. A stale or forged
-- id must yield nothing rather than an invitation to a stranger.
select is(
  (select count(*)::int from public.issue_session_rsvp_invites(
     '7a5a0000-0000-4000-8000-000000000020',
     array['7a5a0000-0000-4000-8000-000000000003'::uuid])),
  0,
  'someone who is not in the campaign gets no invitation, however they were named');

select is(
  (select count(*)::int from public.issue_session_rsvp_invites(
     '7a5a0000-0000-4000-8000-0000000000aa',
     array['7a5a0000-0000-4000-8000-000000000002'::uuid])),
  0,
  'an unknown proposal issues nothing instead of raising');

-- Re-issuing supersedes the copy in the recipient's calendar (iTIP SEQUENCE)
-- without rotating the token, so a link in the first mail still works.
create temp table reissued as
  select * from public.issue_session_rsvp_invites(
    '7a5a0000-0000-4000-8000-000000000020',
    array['7a5a0000-0000-4000-8000-000000000002'::uuid]);

select is((select sequence from reissued), 1, 're-issuing bumps the iTIP sequence');
select is(
  (select token from reissued),
  (select token from public.session_proposal_invites
    where session_proposal_id = '7a5a0000-0000-4000-8000-000000000020'),
  're-issuing keeps the token, so an older mail still answers');
select is(
  (select count(*)::int from public.session_proposal_invites
    where session_proposal_id = '7a5a0000-0000-4000-8000-000000000020'),
  1,
  'three issuances leave one invitation, not three');

-- ── Reading ──────────────────────────────────────────────────────────────────

create temp table tok as
  select token from public.session_proposal_invites
  where session_proposal_id = '7a5a0000-0000-4000-8000-000000000020';

select is(
  public.get_session_rsvp_invite((select token from tok)) ->> 'title',
  'Session 12',
  'the page can name the evening it is about to answer for');

-- A leaked link should not also disclose who it was issued to.
select ok(
  not (public.get_session_rsvp_invite((select token from tok)) ? 'user_id')
  and not (public.get_session_rsvp_invite((select token from tok)) ? 'email'),
  'the invite projection names the session, never the invitee');

select is(
  public.get_session_rsvp_invite('7a5a0000-0000-4000-8000-0000000000ff'),
  null,
  'an unknown token describes nothing');

-- ── Recording ────────────────────────────────────────────────────────────────

select is(
  public.record_session_rsvp((select token from tok), true) ->> 'recorded',
  'true',
  'accepting from the mail app records the answer');

select is(
  (select available from public.session_availability
    where session_proposal_id = '7a5a0000-0000-4000-8000-000000000020'
      and user_id = '7a5a0000-0000-4000-8000-000000000002'),
  true,
  'the answer lands on the invitee, not on whoever clicked');

-- Changing your mind is the common case, not an edge case: the same link is
-- clicked twice and the second answer must win rather than conflict.
create temp table second_answer as
  select public.record_session_rsvp((select token from tok), false) as result;

select is(
  (select available from public.session_availability
    where session_proposal_id = '7a5a0000-0000-4000-8000-000000000020'
      and user_id = '7a5a0000-0000-4000-8000-000000000002'),
  false,
  'answering again replaces the previous answer');

select isnt(
  (select responded_at from public.session_proposal_invites
    where session_proposal_id = '7a5a0000-0000-4000-8000-000000000020'),
  null,
  'the invitation records that it was answered');

-- A cancelled date is the one refusal — there is nothing left to be available for.
create temp table cancelled_invite as
  select token from public.issue_session_rsvp_invites(
    '7a5a0000-0000-4000-8000-000000000021',
    array['7a5a0000-0000-4000-8000-000000000002'::uuid]);

select is(
  public.record_session_rsvp((select token from cancelled_invite), true) ->> 'reason',
  'cancelled',
  'a cancelled proposal records nothing and says why');

select is(
  public.record_session_rsvp('7a5a0000-0000-4000-8000-0000000000ff', true),
  null,
  'an unknown token records nothing');

select * from finish();
rollback;
