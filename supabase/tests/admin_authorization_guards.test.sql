begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Regression cover for the private.is_app_admin() NULL bypass
-- (20260809144926). The helper used to return NULL rather than false for an
-- ordinary user, because `(jwt -> 'app_metadata' ->> 'role') = 'admin'` is NULL
-- when the key is absent. Affirmative callers were fine (NULL denies like
-- false), but every `if not is_app_admin() then raise` guard fell straight
-- through: `not NULL` is NULL and `if NULL then` never fires.
--
-- These tests are written against the OUTCOME (does the guard refuse?), not
-- against the helper's body, so they stay meaningful if the implementation is
-- rewritten again.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  -- ordinary, non-admin, non-Pro
  ('69000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-plain@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  -- app admin
  ('69000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-admin@example.invalid', '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb),
  -- ledger owner (the victim whose billing history must stay private)
  ('69000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-victim@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

insert into public.ai_credit_ledger (id, user_id, delta, reason, pending)
values ('69000000-0000-4000-8000-000000000030', '69000000-0000-4000-8000-000000000003', -5, 'npc_text', false);

insert into public.campaigns (id, user_id, name)
values ('69000000-0000-4000-8000-000000000010', '69000000-0000-4000-8000-000000000001', 'BYOK guard test');

-- ── The helper itself is total ───────────────────────────────────────────────
-- It must answer false, never NULL: NULL is what made every negated guard fall
-- through, and `is(..., false)` fails on NULL where a truthiness check would not.

select is(private.is_app_admin(), false, 'is_app_admin() is false (not NULL) with no JWT at all');

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);
select is(private.is_app_admin(), false, 'is_app_admin() is false (not NULL) for an ordinary user whose JWT has no admin role');

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select is(private.is_app_admin(), true, 'is_app_admin() is still true for a genuine app admin');

-- Checked here, as postgres, rather than beside the BYOK cases below:
-- is_user_pro is deliberately NOT executable by `authenticated`
-- (20260615000006) — only the SECURITY DEFINER trigger calls it.
select is(public.is_user_pro('69000000-0000-4000-8000-000000000001'), false,
  'the BYOK test user really is non-Pro (otherwise the guards below prove nothing)');

-- ── get_user_ledger: another account's billing history ───────────────────────
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);
select throws_ok(
  $$ select * from public.get_user_ledger('69000000-0000-4000-8000-000000000003') $$,
  'Not authorized',
  'a non-admin cannot read another user''s credit ledger');

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select is(
  (select count(*)::int from public.get_user_ledger('69000000-0000-4000-8000-000000000003')),
  1,
  'an app admin can still read a user''s credit ledger');

-- ── enforce_byok_pro_only: the Pro-only BYOK write gate ──────────────────────
-- 20260615000002's whole purpose: a free account must not be able to set a
-- provider key directly and thereby take the BYOK path, which skips credit
-- deduction. errcode is check_violation (23514).

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);

select throws_ok(
  $$ update public.campaigns set openai_api_key = 'enc:v1:aa:bb'
      where id = '69000000-0000-4000-8000-000000000010' $$,
  '23514',
  null,
  'a non-Pro owner cannot set a BYOK key by updating their campaign');

select throws_ok(
  $$ insert into public.campaigns (user_id, name, gemini_api_key)
     values ('69000000-0000-4000-8000-000000000001', 'BYOK on insert', 'enc:v1:cc:dd') $$,
  '23514',
  null,
  'a non-Pro owner cannot smuggle a BYOK key in on insert');

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select lives_ok(
  $$ insert into public.campaigns (user_id, name, openai_api_key)
     values ('69000000-0000-4000-8000-000000000002', 'admin BYOK', 'enc:v1:ee:ff') $$,
  'a Pro-equivalent account (app admin) may still set a BYOK key');

reset role;

select * from finish();
rollback;
