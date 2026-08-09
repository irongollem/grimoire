begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

-- #642 part two (20260809214703): the admin actions that used to be direct
-- table writes from the browser are now SECURITY DEFINER RPCs that log what they
-- did, and the policies that permitted the direct writes are gone.
--
-- The tests that matter most here are the *negative* ones. An audit log is only
-- worth its storage if the action cannot be performed without it, so alongside
-- "the entry was written" this asserts that the old paths — `update
-- user_subscriptions`, `insert into ai_credit_ledger` as an admin — no longer
-- exist. If someone restores either policy for convenience, these fail.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  -- app admin (the actor)
  ('6a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-admin@example.invalid', '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb),
  -- ordinary user (the target)
  ('6a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-target@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

-- The signup trigger creates these in a live database; inserted explicitly so
-- the test does not depend on trigger presence.
insert into public.user_subscriptions (user_id, plan_id, status)
values
  ('6a000000-0000-4000-8000-000000000001', 'free', 'active'),
  ('6a000000-0000-4000-8000-000000000002', 'free', 'active')
on conflict (user_id) do nothing;

-- ── The vocabulary is pinned ─────────────────────────────────────────────────
-- Written before any of the RPC tests: if the CHECK is missing, several of the
-- assertions below would pass against a log that accepts arbitrary strings.
select throws_ok($$
  insert into public.admin_audit_log (admin_user_id, action, target_user_id)
  values ('6a000000-0000-4000-8000-000000000001', 'made_up_action', '6a000000-0000-4000-8000-000000000002')
$$, '23514', null, 'an unrecognised action is rejected by admin_audit_log_action_check');

set local role authenticated;

-- ── A non-admin cannot reach any of the three ────────────────────────────────
-- private.is_app_admin() is total since 20260809144926, so `if not ...` really
-- does raise here rather than falling through (the bug these guards inherit).
select set_config('request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);

select throws_ok(
  $$ select public.admin_set_user_plan('6a000000-0000-4000-8000-000000000002', 'pro') $$,
  'Not authorized', 'a non-admin cannot change a plan');

select throws_ok(
  $$ select public.admin_set_user_suspended('6a000000-0000-4000-8000-000000000002', true, 'because') $$,
  'Not authorized', 'a non-admin cannot freeze an account');

select throws_ok(
  $$ select public.admin_grant_credits('6a000000-0000-4000-8000-000000000002', 500, 'free money') $$,
  'Not authorized', 'a non-admin cannot grant themselves credits');

-- ── The direct write paths the RPCs replace are closed ───────────────────────
-- Both of these succeeded before 20260809214703 — for the admin via the dropped
-- policies, and that is precisely what made the log skippable. RLS denies rather
-- than raising, so the assertion is on the row count, not on an exception.
select set_config('request.jwt.claims',
  '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);

update public.user_subscriptions set plan_id = 'pro'
where user_id = '6a000000-0000-4000-8000-000000000002';

select is(
  (select plan_id from public.user_subscriptions where user_id = '6a000000-0000-4000-8000-000000000002'),
  'free',
  'an admin can no longer change a plan by updating the table directly');

select throws_ok($$
  insert into public.ai_credit_ledger (user_id, delta, reason)
  values ('6a000000-0000-4000-8000-000000000002', 100, 'sneaky')
$$, '42501', null, 'an admin can no longer insert a ledger row directly');

-- The log itself is unwritable even by an admin: no INSERT policy, and since
-- this migration no INSERT grant either.
select throws_ok($$
  insert into public.admin_audit_log (admin_user_id, action, target_user_id)
  values ('6a000000-0000-4000-8000-000000000001', 'plan_change', '6a000000-0000-4000-8000-000000000002')
$$, '42501', null, 'an admin cannot forge an audit entry by hand');

-- ── Plan change ──────────────────────────────────────────────────────────────
select lives_ok(
  $$ select public.admin_set_user_plan('6a000000-0000-4000-8000-000000000002', 'pro') $$,
  'an app admin can change a plan through the RPC');

select is(
  (select plan_id from public.user_subscriptions where user_id = '6a000000-0000-4000-8000-000000000002'),
  'pro',
  'the plan actually changed');

-- The predecessor is the part a bare "now on pro" entry could not answer.
select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'plan_change'
     and admin_user_id = '6a000000-0000-4000-8000-000000000001'
     and target_user_id = '6a000000-0000-4000-8000-000000000002'
     and details ->> 'from' = 'free'
     and details ->> 'to' = 'pro'),
  1,
  'the plan change is logged with what the plan was, not just what it became');

-- ── Freeze / unfreeze ────────────────────────────────────────────────────────
select lives_ok(
  $$ select public.admin_set_user_suspended('6a000000-0000-4000-8000-000000000002', true, 'chargeback') $$,
  'an app admin can freeze an account through the RPC');

select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'account_freeze'
     and target_user_id = '6a000000-0000-4000-8000-000000000002'
     and details ->> 'reason' = 'chargeback'),
  1,
  'the freeze is logged with its reason');

-- Re-freezing changes nothing, so it must not produce a second entry: a log read
-- as a record of things that happened must not fill with things that did not.
select public.admin_set_user_suspended('6a000000-0000-4000-8000-000000000002', true, 'chargeback');
select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'account_freeze' and target_user_id = '6a000000-0000-4000-8000-000000000002'),
  1,
  'freezing an already-frozen account logs nothing further');

select public.admin_set_user_suspended('6a000000-0000-4000-8000-000000000002', false, null);
select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'account_unfreeze' and target_user_id = '6a000000-0000-4000-8000-000000000002'),
  1,
  'lifting the freeze is its own entry');

-- ── Credit grants ────────────────────────────────────────────────────────────
select throws_ok(
  $$ select public.admin_grant_credits('6a000000-0000-4000-8000-000000000002', 0, 'nothing') $$,
  'admin_grant_credits: delta must be non-zero',
  'a zero grant is refused rather than logged as an action with no effect');

select lives_ok(
  $$ select public.admin_grant_credits('6a000000-0000-4000-8000-000000000002', 250, 'goodwill') $$,
  'an app admin can grant credits through the RPC');

select is(
  (select count(*)::integer from public.ai_credit_ledger
   where user_id = '6a000000-0000-4000-8000-000000000002'
     and delta = 250 and reason = 'goodwill'
     -- Defaults must match what the dropped client insert produced, or existing
     -- and new grants project differently through computePackLots.
     and bucket = 'purchased' and pending = false and is_byok = false),
  1,
  'the ledger row lands with the same shape the client insert produced');

select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'credit_grant'
     and target_user_id = '6a000000-0000-4000-8000-000000000002'
     and (details ->> 'delta')::numeric = 250
     and details ->> 'reason' = 'goodwill'),
  1,
  'the grant is logged with its amount and stated reason');

reset role;

select * from finish();
rollback;
