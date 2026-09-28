begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

-- Cover for parent-managed accounts (#919, 20260928053257_child_accounts).
--
-- What must not rot: a child account never reaches paid AI or Pro (the gate
-- that closes bring-your-own-key), nobody but the parent and the child sees the
-- link, nobody at all can write it from the browser, and the parent requests
-- stay invisible. The predicate must also be total, because a NULL from it in a
-- negated position is exactly how is_app_admin() once let everyone through.

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('c41d0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'parent@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('c41d0000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-mira@players.dungeongrimoire.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('c41d0000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('c41d0000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-grown@players.dungeongrimoire.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version)
values
  ('c41d0000-0000-4000-8000-000000000002', 'c41d0000-0000-4000-8000-000000000001', 'pgtap-mira', current_date + 400, '2026-09-28'),
  -- A link whose adult_on has passed but the daily sweep has not yet removed.
  ('c41d0000-0000-4000-8000-000000000004', 'c41d0000-0000-4000-8000-000000000001', 'pgtap-grown', current_date, '2026-09-28');

-- The child was given a Pro-equivalent plan somehow (an old invite, an admin
-- mistake). It must not matter.
update public.user_subscriptions set plan_id = 'tester', status = 'active'
 where user_id = 'c41d0000-0000-4000-8000-000000000002';

insert into public.campaigns (id, user_id, name)
values ('c41d0000-0000-4000-8000-000000000010', 'c41d0000-0000-4000-8000-000000000001', 'Family game');

insert into public.campaign_invites (campaign_id, token, role, created_by)
values ('c41d0000-0000-4000-8000-000000000010', 'c41d0000-0000-4000-8000-0000000000a1', 'player', 'c41d0000-0000-4000-8000-000000000001');

insert into public.parental_consent_requests (parent_email, child_user_id)
values ('parent@example.invalid', 'c41d0000-0000-4000-8000-000000000003');

-- ── The predicate ────────────────────────────────────────────────────────────

select is(private.is_child_account('c41d0000-0000-4000-8000-000000000002'), true,
  'an account before its adult_on is a child account');
select is(private.is_child_account('c41d0000-0000-4000-8000-000000000004'), false,
  'from adult_on the account is its own, even before the sweep removes the link');
select is(private.is_child_account('c41d0000-0000-4000-8000-000000000003'), false,
  'an unlinked account is not a child account');
select is(private.is_child_account(null), false,
  'the predicate is total: NULL in, false out, never NULL');

-- ── The gates ────────────────────────────────────────────────────────────────

select is(public.assert_spend_allowed('c41d0000-0000-4000-8000-000000000002', 1),
  '{"ok": false, "child_account": true}'::jsonb,
  'paid AI refuses a child account, and says why');
select is((public.assert_spend_allowed('c41d0000-0000-4000-8000-000000000003', 1)) ->> 'ok', 'true',
  'paid AI still admits an ordinary account');

select is(public.is_user_pro('c41d0000-0000-4000-8000-000000000002'), false,
  'a child account is never Pro, whatever its plan row says — this is what closes bring-your-own-key');

update public.user_subscriptions set plan_id = 'tester', status = 'active'
 where user_id = 'c41d0000-0000-4000-8000-000000000003';
select is(public.is_user_pro('c41d0000-0000-4000-8000-000000000003'), true,
  'an ordinary tester is still Pro');

-- ── Grants ───────────────────────────────────────────────────────────────────

select ok(not has_function_privilege('authenticated', 'private.is_child_account(uuid)', 'EXECUTE'),
  'the predicate is not callable from the browser');
select ok(not has_function_privilege('anon', 'public.accept_terms(text)', 'EXECUTE'),
  'anon cannot accept terms');
select ok(has_function_privilege('authenticated', 'public.accept_terms(text)', 'EXECUTE'),
  'a signed-in user can accept terms');
select ok(not has_function_privilege('authenticated', 'public.join_campaign_for_child(uuid, uuid)', 'EXECUTE'),
  'joining a campaign on a child''s behalf is not callable from the browser');
select ok(not has_function_privilege('anon', 'public.join_campaign_for_child(uuid, uuid)', 'EXECUTE'),
  'nor by anon');

-- The function refuses on its own too, so a drop-and-create that resets the
-- ACL (the route #650 took) cannot open it.
select set_config('request.jwt.claims',
  '{"sub":"c41d0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.join_campaign_for_child('c41d0000-0000-4000-8000-0000000000a1', 'c41d0000-0000-4000-8000-000000000002') $$,
  'join_campaign_for_child can only be called by service_role',
  'a signed-in parent holding EXECUTE still cannot call it directly');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$ select public.join_campaign_for_child('c41d0000-0000-4000-8000-0000000000a1', 'c41d0000-0000-4000-8000-000000000003') $$,
  'Not a child account',
  'it only ever joins child accounts');
select is(
  public.join_campaign_for_child('c41d0000-0000-4000-8000-0000000000a1', 'c41d0000-0000-4000-8000-000000000002'),
  'c41d0000-0000-4000-8000-000000000010'::uuid,
  'service_role joins the child to the invite''s campaign');
select is(
  (select role from public.campaign_members
    where campaign_id = 'c41d0000-0000-4000-8000-000000000010'
      and user_id = 'c41d0000-0000-4000-8000-000000000002'),
  'player', 'as a player');

-- ── Parent export and erasure ───────────────────────────────────────────────
-- Still as service_role. The edge functions check the link first; these are
-- the database's own re-checks, which hold even if an edge function forgets.

select throws_ok(
  $$ select public.export_user_data('c41d0000-0000-4000-8000-000000000002', 'c41d0000-0000-4000-8000-000000000003') $$,
  'export_user_data: not this account''s parent',
  'a stranger cannot export a child''s account by claiming to be the parent');
select is(
  (public.export_user_data('c41d0000-0000-4000-8000-000000000002', 'c41d0000-0000-4000-8000-000000000001')
     -> 'identity' ->> 'user_id'),
  'c41d0000-0000-4000-8000-000000000002',
  'the parent exports their child''s account');
select is(
  (select identity_verification from public.dsr_requests
    where user_id = 'c41d0000-0000-4000-8000-000000000002'
    order by received_at desc limit 1),
  'parent_session', 'and the DSR log records that a parent asked, not the child');

select throws_ok(
  $$ select public.prepare_user_erasure('c41d0000-0000-4000-8000-000000000002', 'c41d0000-0000-4000-8000-000000000003', 'parent') $$,
  'prepare_user_erasure: a parent erasure must be performed by the child''s parent',
  'a stranger cannot erase a child''s account as its parent');
select throws_ok(
  $$ select public.prepare_user_erasure('c41d0000-0000-4000-8000-000000000002', 'c41d0000-0000-4000-8000-000000000001', null) $$,
  'prepare_user_erasure: actor_kind must be self, admin or parent, got <NULL>',
  'a NULL actor kind is refused, not waved through every actor check');
select throws_ok(
  $$ select public.prepare_user_erasure('c41d0000-0000-4000-8000-000000000001', 'c41d0000-0000-4000-8000-000000000001', 'self') $$,
  'prepare_user_erasure: account still manages child accounts',
  'a parent cannot erase their own account while a child depends on it, so the RESTRICT never fires mid-erasure');
select is(
  (select count(*)::int from public.child_accounts where child_user_id = 'c41d0000-0000-4000-8000-000000000004'),
  1, 'and the refused erasure rolled back, graduated link included');

-- ── accept_terms ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub":"c41d0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.accept_terms('2026-09-28') $$,
  'A parent accepts the terms for a child account',
  'a child cannot accept the terms: the parent''s consent did');

select set_config('request.jwt.claims',
  '{"sub":"c41d0000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.accept_terms('latest') $$,
  'Invalid terms version', 'the version must be a date');
select throws_ok($$ select public.accept_terms('2026-09-27') $$,
  'Invalid terms version', 'and it must be the current one, not any date');
-- Stranger (…003) has an open parent request from the fixture: they said they
-- were under 16, so a later adult answer must not reopen the account.
select throws_ok($$ select public.accept_terms('2026-09-28') $$,
  'Waiting for a parent to approve this account',
  'an account waiting on its parent cannot accept the terms by answering the age question differently');
delete from public.parental_consent_requests where child_user_id = 'c41d0000-0000-4000-8000-000000000003';
select lives_ok($$ select public.accept_terms('2026-09-28') $$, 'an ordinary account accepts');
select is(
  (select terms_version from public.user_subscriptions where user_id = 'c41d0000-0000-4000-8000-000000000003'),
  '2026-09-28', 'and the version is recorded');

-- ── RLS: who sees the link, and that nobody writes it ────────────────────────

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"c41d0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.child_accounts), 2, 'the parent sees both of their children');

select set_config('request.jwt.claims',
  '{"sub":"c41d0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.child_accounts), 1, 'the child sees only their own link');
-- RLS with no delete policy filters to zero rows rather than raising, so the
-- outcome is asserted again after reset role below.
select is_empty(
  $$ delete from public.child_accounts where child_user_id = 'c41d0000-0000-4000-8000-000000000002' returning 1 $$,
  'the child cannot unlink themselves');

select set_config('request.jwt.claims',
  '{"sub":"c41d0000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.child_accounts), 0, 'a stranger sees nothing');
select throws_ok(
  $$ insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version)
     values ('c41d0000-0000-4000-8000-000000000003', 'c41d0000-0000-4000-8000-000000000003', 'me', current_date + 1, 'x') $$,
  '42501', null, 'nobody can write a link from the browser');
select is((select count(*)::int from public.parental_consent_requests), 0,
  'parent requests are invisible to everyone in the browser, the child they concern included');

reset role;

select is((select count(*)::int from public.child_accounts
            where child_user_id = 'c41d0000-0000-4000-8000-000000000002'), 1,
  'the child''s attempt to unlink themselves changed nothing');

select * from finish();
rollback;
