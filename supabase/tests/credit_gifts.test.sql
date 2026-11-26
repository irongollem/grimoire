begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- Credits the admin gives an account, told to its owner (20261125233731).
-- A positive admin grant leaves a gift the owner sees once; the owner may only
-- mark it seen, and nobody else may read it.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('6b000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gift-admin@example.invalid', '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb),
  ('6b000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gift-owner@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb),
  ('6b000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gift-other@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb);

set local role authenticated;

-- ── As the admin ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"6b000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);

select public.admin_grant_credits('6b000000-0000-4000-8000-000000000002', 250, 'bug_report', '  Thanks for reporting the recipe bug!  ');
select public.admin_grant_credits('6b000000-0000-4000-8000-000000000002', 40, 'admin_grant');
select public.admin_grant_credits('6b000000-0000-4000-8000-000000000002', -10, 'correction');

select throws_ok(
  $$ select public.admin_grant_credits('6b000000-0000-4000-8000-000000000002', -10, 'correction', 'sorry') $$,
  'admin_grant_credits: a message goes with a gift, not with taking credits back',
  'a message cannot go with taking credits back');

reset role;

select is(
  (select count(*)::integer from public.credit_gifts where user_id = '6b000000-0000-4000-8000-000000000002'),
  2,
  'each positive grant leaves one gift, and taking credits back leaves none');

select is(
  (select message from public.credit_gifts where user_id = '6b000000-0000-4000-8000-000000000002' and credits = 250),
  'Thanks for reporting the recipe bug!',
  'the message is kept, trimmed');

select is(
  (select message from public.credit_gifts where user_id = '6b000000-0000-4000-8000-000000000002' and credits = 40),
  null,
  'a grant with no message leaves a gift with none');

select is(
  (select count(*)::integer from public.credit_gifts g
   join public.ai_credit_ledger l on l.id = g.ledger_id
   where g.user_id = '6b000000-0000-4000-8000-000000000002' and l.delta = g.credits),
  2,
  'every gift points at the ledger row that paid it');

set local role authenticated;

-- ── As someone else ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"6b000000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"provider":"email"}}', true);

select is_empty(
  $$ select 1 from public.credit_gifts where user_id = '6b000000-0000-4000-8000-000000000002' $$,
  'another account cannot read the gifts');

update public.credit_gifts set seen_at = now() where user_id = '6b000000-0000-4000-8000-000000000002';

-- ── As the owner ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"6b000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email"}}', true);

select is(
  (select count(*)::integer from public.credit_gifts where seen_at is null),
  2,
  'the owner sees both gifts unseen, so another account could not mark them seen');

select throws_ok(
  $$ update public.credit_gifts set credits = 9999 $$,
  '42501', null, 'the owner cannot change what a gift was worth');

select throws_ok(
  $$ insert into public.credit_gifts (user_id, ledger_id, credits)
     select user_id, ledger_id, 5 from public.credit_gifts limit 1 $$,
  '42501', null, 'the owner cannot write a gift of their own');

update public.credit_gifts set seen_at = now();

select is(
  (select count(*)::integer from public.credit_gifts where seen_at is null),
  0,
  'the owner can mark their gifts seen');

-- ── Not as the admin's client ────────────────────────────────────────────────
select throws_ok(
  $$ select public.admin_grant_credits('6b000000-0000-4000-8000-000000000002', 100, 'x', 'free') $$,
  'Not authorized', 'a non-admin cannot give a gift');

reset role;

select * from finish();
rollback;
