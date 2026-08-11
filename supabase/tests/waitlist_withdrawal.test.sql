begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

-- Cover for waitlist consent withdrawal (#638, 20260811221206).
-- Companion to context/compliance/retention.md §4.
--
-- The gap this closes was not a missing feature but a missing exit: giving
-- consent was one anonymous POST and there was no way back out that a person
-- without an account could take. So most of what follows asserts the exit stays
-- open and stays narrow — one row per token, no address in the audit trail, and
-- the capture path (which anon must still be able to use) unchanged.

-- ── 1. The token exists on every row, and only ever names one ───────────────
-- Defaulted rather than supplied: the marketing form posts `{email, source}`
-- and knows nothing about tokens, so a column the insert had to fill would
-- have broken capture on deploy.

set local role anon;

insert into public.pro_waitlist (email, source)
values ('leaver@example.invalid', 'test'), ('stayer@example.invalid', 'test');

reset role;

select isnt(
  (select unsubscribe_token from public.pro_waitlist where email = 'leaver@example.invalid'),
  null,
  'an anonymous signup gets an unsubscribe token without asking for one');

select isnt(
  (select unsubscribe_token from public.pro_waitlist where email = 'leaver@example.invalid'),
  (select unsubscribe_token from public.pro_waitlist where email = 'stayer@example.invalid'),
  'two signups do not share a token');

-- Asserted behaviourally rather than by inspecting the index: what has to hold
-- is that a token cannot name two rows, because withdraw_waitlist_consent
-- deletes by token and would otherwise unsubscribe a stranger alongside the
-- person who clicked.
select throws_ok($$
  insert into public.pro_waitlist (email, unsubscribe_token)
  values ('collider@example.invalid',
          (select unsubscribe_token from public.pro_waitlist where email = 'leaver@example.invalid'))
$$, '23505', null, 'two rows cannot share an unsubscribe token');

select col_not_null('public', 'pro_waitlist', 'unsubscribe_token',
  'unsubscribe_token is not null, so no row can exist without a way off the list');

-- ── 2. The link route is service_role only ──────────────────────────────────
-- The Edge Function fronts it because PostgREST cannot serve an RFC 8058
-- one-click POST (no apikey header on the request a mail client sends). Anon
-- reaching this directly would be a delete-by-guess endpoint on the anon
-- surface, which anon_rpc_surface.test.sql exists to keep at five entries.

select ok(
  not has_function_privilege('anon', 'public.withdraw_waitlist_consent(uuid)', 'EXECUTE'),
  'anon cannot execute withdraw_waitlist_consent');

select ok(
  not has_function_privilege('authenticated', 'public.withdraw_waitlist_consent(uuid)', 'EXECUTE'),
  'authenticated cannot execute withdraw_waitlist_consent');

select ok(
  has_function_privilege('service_role', 'public.withdraw_waitlist_consent(uuid)', 'EXECUTE'),
  'service_role can execute withdraw_waitlist_consent');

-- Asserted while still holding EXECUTE (as the test's superuser role), for the
-- same reason as data_export.test.sql: switching to `authenticated` would fail
-- on the ACL before the body ran and prove nothing about the guard. A future
-- `drop function` + `create` resets the ACL to the PUBLIC default, and the
-- guard is what still holds then.
select set_config('request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.withdraw_waitlist_consent('00000000-0000-4000-8000-000000000000') $$,
  'withdraw_waitlist_consent can only be called by service_role',
  'the function refuses a non-service_role caller even when the caller holds EXECUTE');

-- ── 3. The link route removes exactly one row, once ─────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  public.withdraw_waitlist_consent(
    (select unsubscribe_token from public.pro_waitlist where email = 'leaver@example.invalid')),
  'a valid token reports that a row was removed');

select is(
  (select count(*)::int from public.pro_waitlist where email = 'leaver@example.invalid'),
  0,
  'the row is gone');

select is(
  (select count(*)::int from public.pro_waitlist where email = 'stayer@example.invalid'),
  1,
  'the other signup is untouched — a token removes one row, not a batch');

-- Re-using a link (mail clients retry, people click twice) is not an error and
-- must not look like one to the page: it reports false and the page says
-- "you're not on the list", which is true.
select ok(
  not public.withdraw_waitlist_consent('00000000-0000-4000-8000-000000000000'),
  'an unknown token reports that nothing matched rather than raising');

select ok(
  not public.withdraw_waitlist_consent(null),
  'a null token reports that nothing matched rather than raising');

-- ── 4. The email route is admin-gated ───────────────────────────────────────
-- private.is_app_admin() is total since 20260809144926, so `if not ...` really
-- raises here rather than falling through — the class of bug CLAUDE.md item 3
-- describes, and the reason this assertion is worth its line.

select set_config('request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","providers":["email"]}}', true);

select throws_ok(
  $$ select public.admin_remove_waitlist_email('stayer@example.invalid') $$,
  'Not authorized',
  'a non-admin cannot remove someone from the waitlist');

select is(
  (select count(*)::int from public.pro_waitlist where email = 'stayer@example.invalid'),
  1,
  'and the row survives the refused attempt');

select ok(
  not has_function_privilege('anon', 'public.admin_remove_waitlist_email(text, text)', 'EXECUTE'),
  'anon cannot execute admin_remove_waitlist_email');

-- ── 5. The email route removes, counts, and records without the address ─────
-- The audit entry is the whole reason an operator action is allowed to bypass
-- the token: §4d says privileged actions are attributable. But admin_audit_log
-- runs on a seven-year period, so an entry naming the address would hand back
-- the erasure it is recording — the one assertion here that is about what is
-- NOT written.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('64000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'waitlist-admin@example.invalid', '',
        '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb);

select set_config('request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);

-- Upper-cased on purpose: the operator copies the address out of a mail, and
-- the match has to behave like pro_waitlist_email_key, which is on lower(email).
select is(
  public.admin_remove_waitlist_email('STAYER@Example.Invalid', 'wrote to info@'),
  1,
  'an admin removes an address case-insensitively and gets the count back');

select is(
  (select count(*)::int from public.pro_waitlist where email = 'stayer@example.invalid'),
  0,
  'the row is gone');

select is(
  (select details::text from public.admin_audit_log
    where action = 'waitlist_removal' order by created_at desc limit 1),
  '{"reason": "wrote to info@", "rows_removed": 1}',
  'the audit entry records the count and the reason and nothing that identifies the address');

-- An address that was never on the list is a real answer, not an error: it is
-- what the operator has to tell the person who wrote in.
select is(
  public.admin_remove_waitlist_email('never-joined@example.invalid'),
  0,
  'removing an address that was not on the list reports zero rather than raising');

select * from finish();
rollback;
