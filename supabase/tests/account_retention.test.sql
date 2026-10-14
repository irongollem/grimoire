begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

-- The inactivity retention period (20261014194554): an account unused for 12
-- months is due a notice, and deletable 30 days after it if still unused. The
-- state is computed once, in private.account_retention(), and read by both the
-- admin list and the notice sender, so these tests pin the state machine and
-- the exemptions there, and the walls around the three new functions.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, banned_until, created_at)
values
  ('10140000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-stale@example.invalid',   '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-pro@example.invalid',     '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-parent@example.invalid',  '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-child@kids.invalid',      '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-live-dm@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-seated@example.invalid',  '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-gone-dm@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-gone-pc@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-fresh@example.invalid',   '', '{"provider":"email"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-admin@example.invalid',   '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb, null, now() - interval '2 years'),
  ('10140000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ret-banned@example.invalid',  '', '{"provider":"email"}'::jsonb, '{}'::jsonb, now() + interval '1 year', now() - interval '2 years');

-- Everyone but the fresh account and the live DM was last seen 13 months ago.
insert into public.account_activity (user_id, last_active_at)
select id, case when id in ('10140000-0000-4000-8000-000000000005', '10140000-0000-4000-8000-000000000009')
                then now() - interval '1 day' else now() - interval '13 months' end
  from auth.users where id::text like '10140000-%'
on conflict (user_id) do update set last_active_at = excluded.last_active_at;

update public.user_subscriptions set plan_id = 'pro', status = 'active'
 where user_id = '10140000-0000-4000-8000-000000000002';

insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version)
values ('10140000-0000-4000-8000-000000000004', '10140000-0000-4000-8000-000000000003', 'pgtap-ret-k', current_date + 400, '2026-09-28');

insert into public.campaigns (id, user_id, name) values
  ('10140000-0000-4000-8000-000000000050', '10140000-0000-4000-8000-000000000005', 'Live table'),
  ('10140000-0000-4000-8000-000000000070', '10140000-0000-4000-8000-000000000007', 'Abandoned table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10140000-0000-4000-8000-000000000050', '10140000-0000-4000-8000-000000000006', 'player', 'Seated'),
  ('10140000-0000-4000-8000-000000000070', '10140000-0000-4000-8000-000000000008', 'player', 'Left behind');

create temporary view ret as
  select user_id, exempt_reason, retention_state from private.account_retention()
   where user_id::text like '10140000-%';

-- ── States and exemptions ────────────────────────────────────────────────────
select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000001'), 'notice_due',
  'an account unused for 13 months is due a notice');
select is((select exempt_reason from ret where user_id = '10140000-0000-4000-8000-000000000002'), 'plan',
  'a Pro account is exempt');
select is((select exempt_reason from ret where user_id = '10140000-0000-4000-8000-000000000010'), 'plan',
  'an app admin is exempt (is_user_pro ranks admins as Pro)');
select is((select exempt_reason from ret where user_id = '10140000-0000-4000-8000-000000000003'), 'parent',
  'a parent of a child account is exempt (delete-account would refuse it)');
select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000004'), 'notice_due',
  'an unused child account is due a notice');
select is((select exempt_reason from ret where user_id = '10140000-0000-4000-8000-000000000006'), 'seated',
  'a player seated at a table whose DM is active is exempt');
select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000008'), 'notice_due',
  'a player whose DM is gone too is not protected by the seat');
select is((select exempt_reason from ret where user_id = '10140000-0000-4000-8000-000000000011'), 'banned',
  'a locked-out account is exempt: "sign in to keep it" would be untrue');
select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000009'), 'kept',
  'a recently active account is kept');

-- ── The notice sender's calls ────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select set_eq(
  $$ select user_id::text from public.inactivity_notice_recipients() where user_id::text like '10140000-%' $$,
  array['10140000-0000-4000-8000-000000000001', '10140000-0000-4000-8000-000000000004',
        '10140000-0000-4000-8000-000000000007', '10140000-0000-4000-8000-000000000008'],
  'the recipients are exactly the accounts due a notice');
select is(
  (select email from public.inactivity_notice_recipients() where user_id = '10140000-0000-4000-8000-000000000004'),
  'ret-parent@example.invalid',
  'a child account''s notice goes to the parent''s address, not the reserved login');

select public.record_inactivity_notice('10140000-0000-4000-8000-000000000001', true);
reset role;

select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000001'), 'notice_sent',
  'a recorded notice moves the account to notice_sent');
select is((select last_active_at < now() - interval '12 months' from public.account_activity
            where user_id = '10140000-0000-4000-8000-000000000001'), true,
  'recording a notice is not itself activity');

update public.account_activity set inactivity_notice_sent_at = now() - interval '31 days'
 where user_id = '10140000-0000-4000-8000-000000000001';
select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000001'), 'deletable',
  'thirty days after the notice, still unused, the account is deletable');

-- ── Activity keeps the account ───────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10140000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.touch_account_activity();
reset role;
select is((select retention_state from ret where user_id = '10140000-0000-4000-8000-000000000001'), 'kept',
  'any visit after the notice keeps the account, with nothing to clear');

-- ── Walls ────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.touch_account_activity() $$, 'Not signed in',
  'touch_account_activity refuses a caller with no user');

select set_config('request.jwt.claims',
  '{"sub":"10140000-0000-4000-8000-000000000009","role":"authenticated"}', true);
select throws_ok($$ select * from public.inactivity_notice_recipients() $$, '42501', null,
  'a signed-in user cannot list the notice recipients (and their addresses)');
select throws_ok($$ select public.record_inactivity_notice('10140000-0000-4000-8000-000000000009', true) $$, '42501', null,
  'a signed-in user cannot record a notice');
select throws_ok($$ update public.account_activity set last_active_at = now() + interval '900 years' $$, '42501', null,
  'a signed-in user cannot write account_activity directly (and so cannot opt out of the period)');
reset role;

-- The function's own service-role guard, behind the grant: reached as postgres
-- with an ordinary user's claims, it still refuses.
select set_config('request.jwt.claims',
  '{"sub":"10140000-0000-4000-8000-000000000009","role":"authenticated"}', true);
select throws_ok($$ select * from public.inactivity_notice_recipients() $$,
  'inactivity_notice_recipients can only be called by service_role',
  'inactivity_notice_recipients checks the service role itself, not only through its grant');

select * from finish();
rollback;
