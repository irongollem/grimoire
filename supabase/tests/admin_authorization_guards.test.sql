begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

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
--
-- Extended by 20260809222131 (#640) with the two functions that inlined the
-- claim comparison rather than calling the helper, and so were NOT fixed by
-- 20260809144926: get_admin_users and get_credit_calibration_hints. Fixing the
-- helper only closes the call sites that go through it, which is why that
-- migration's own list of five did not include them. The two structural tests
-- at the bottom exist to stop a seventh inline copy being written.

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

-- ── get_admin_users: every account's email (#640) ────────────────────────────
-- This one gated on `if (jwt -> 'app_metadata' ->> 'role') <> 'admin'`, which is
-- NULL for an ordinary user, so the raise never fired and the function returned
-- the whole user table -- email, plan, credit balance, suspension and ban state
-- -- to any logged-in caller. `authenticated` holds EXECUTE on it.

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);
select throws_ok(
  $$ select * from public.get_admin_users() $$,
  'Access denied',
  'a non-admin cannot list every account');

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select ok(
  (select count(*) from public.get_admin_users()) >= 3,
  'an app admin still gets the user list (the three users inserted above, at least)');

-- ── get_credit_calibration_hints: 30 days of cost/pricing data (#640) ────────
-- Same inlined guard, same bypass.

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);
select throws_ok(
  $$ select * from public.get_credit_calibration_hints() $$,
  'Admin only',
  'a non-admin cannot read credit calibration hints');

select set_config('request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select lives_ok(
  $$ select * from public.get_credit_calibration_hints() $$,
  'an app admin can still read credit calibration hints');

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

-- ── Structural: private.is_app_admin() is the only reader of the claim ───────
-- Deliberately body-based, unlike everything above, and for a specific reason:
-- an outcome test can only cover a guard someone already thought to write. What
-- went wrong in #640 is that two functions never routed through the helper at
-- all, so fixing the helper in 20260809144926 did not reach them and no
-- existing test noticed. These two assertions fail the moment a new inline copy
-- of `app_metadata ->> 'role'` appears, which is the only way that can recur.
--
-- Both predicates require `app_metadata` AND `->> 'role'` in the same
-- expression, which is what makes them precise rather than merely strict. Three
-- functions read a role legitimately and must not be flagged:
--   * is_user_pro         -- `raw_app_meta_data ->> 'role'` for an ARBITRARY
--                            user id. The helper reads the caller's JWT and
--                            cannot answer that question.
--   * prepare_user_erasure -- `auth.jwt() ->> 'role'` is the top-level Postgres
--                            role claim (service_role), a different claim.
--   * consume_app_invite  -- writes `{"role":"admin"}` into raw_app_meta_data.
--                            That is the grant, not a gate.
-- private.is_app_admin() itself lives in `private`, so the schema filter
-- excludes it.

select is_empty(
  $q$
    select n.nspname || '.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ 'app_metadata'
      and p.prosrc ~ '->>\s*''role'''
  $q$,
  'no function in public compares the caller''s app_metadata role inline — private.is_app_admin() is the single reader');

select is_empty(
  $q$
    select polrelid::regclass::text || '.' || polname
    from pg_policy
    where (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
           coalesce(pg_get_expr(polwithcheck, polrelid), '')) ~ 'app_metadata'
  $q$,
  'no RLS policy compares the caller''s app_metadata role inline');

select * from finish();
rollback;
