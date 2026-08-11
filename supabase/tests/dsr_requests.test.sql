begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

-- Cover for the data-subject request log (#643, 20260811152817).
-- Companion to context/compliance/data-subject-rights.md §4f.
--
-- The defining property of this table is that it must survive the erasure it
-- records. Most of what follows is that one claim from different angles, plus
-- the append-mostly guard that stops the clock it evidences from being edited.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('55000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'dsr-subject@example.invalid', '', now(), now());

-- ── 1. No FK to auth.users, and that is the whole point ─────────────────────
-- Asserted structurally rather than by deleting an account, because the failure
-- mode is a future migration "tidying up" a missing FK — which looks like an
-- improvement and would silently arm the cascade that empties this log of
-- erasure requests.

select is_empty(
  $q$
    select conname::text
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.dsr_requests'::regclass
      and confrelid = 'auth.users'::regclass
  $q$,
  'dsr_requests has no FK to auth.users — the erasure entry must outlive its subject');

-- ── 2. Locked down ──────────────────────────────────────────────────────────

select ok(
  (select relrowsecurity from pg_class where oid = 'public.dsr_requests'::regclass),
  'RLS is enabled on dsr_requests');

select set_eq(
  $$ select polcmd::text from pg_policy where polrelid = 'public.dsr_requests'::regclass $$,
  $$ values ('r') $$,
  'dsr_requests has a SELECT policy and nothing else — every row comes from a definer function');

select ok(
  not has_table_privilege('authenticated', 'public.dsr_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.dsr_requests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.dsr_requests', 'DELETE'),
  'authenticated cannot write dsr_requests directly');

select ok(
  not has_function_privilege('anon', 'public.admin_log_dsr_request(text, text, uuid, text, text)', 'EXECUTE'),
  'anon cannot log a DSR request');

-- ── 3. Self-serve export logs itself ────────────────────────────────────────
-- The §4d lesson applied: the function that does the work writes the entry, in
-- the same statement, so there is no version of "exported but not logged".

select is(
  (select count(*)::int from public.dsr_requests
    where user_id = '55000000-0000-4000-8000-0000000000a1'),
  0,
  'no request logged before the export runs');

select lives_ok(
  $$ select public.export_user_data('55000000-0000-4000-8000-0000000000a1') $$,
  'the export runs');

select is(
  (select request_type || '/' || channel || '/' || outcome
     from public.dsr_requests
    where user_id = '55000000-0000-4000-8000-0000000000a1'),
  'access_portability/self_serve/fulfilled',
  'the export logged itself as a fulfilled self-serve access/portability request');

select isnt(
  (select fulfilled_at from public.dsr_requests
    where user_id = '55000000-0000-4000-8000-0000000000a1'),
  null,
  'self-serve access is instantaneous, so it is logged answered rather than open');

-- An export must not contain the record of itself: the entry is written after
-- the read, so each document is a complete snapshot of the moment before it
-- existed. Without this the second export would report the first, the third
-- both, and no export would ever match the account as it stood.
select is(
  (select jsonb_array_length(
            public.export_user_data('55000000-0000-4000-8000-0000000000a1')
              -> 'tables' -> 'dsr_requests')),
  1,
  'the second export contains the first request but not itself');

-- ── 4. The append-mostly guard ──────────────────────────────────────────────

select throws_ok(
  $$ update public.dsr_requests
        set received_at = now() - interval '90 days'
      where user_id = '55000000-0000-4000-8000-0000000000a1' $$,
  'P0001',
  null,
  'received_at is immutable — an editable clock evidences nothing');

select throws_ok(
  $$ delete from public.dsr_requests
      where user_id = '55000000-0000-4000-8000-0000000000a1' $$,
  'P0001',
  null,
  'dsr_requests rows cannot be deleted outside the retention purge');

-- ── 5. Erasure: the request survives, the person does not ───────────────────

select lives_ok(
  $$ select public.prepare_user_erasure(
       '55000000-0000-4000-8000-0000000000a1',
       '55000000-0000-4000-8000-0000000000a1',
       'self') $$,
  'a self-serve erasure prepares cleanly with earlier DSR rows present');

select is(
  (select count(*)::int from public.dsr_requests
    where user_id = '55000000-0000-4000-8000-0000000000a1'),
  3,
  'both exports and the erasure itself are still on record after erasure preparation');

select is_empty(
  $q$ select id from public.dsr_requests
       where user_id = '55000000-0000-4000-8000-0000000000a1'
         and anonymized_at is null $q$,
  'every one of the subject''s rows is stamped anonymized');

-- Anonymized means finished. Re-attributing an erased subject's row, or
-- rewriting its outcome once nobody is left to contradict it, is refused.
select throws_ok(
  $$ update public.dsr_requests
        set notes = 'rewritten'
      where user_id = '55000000-0000-4000-8000-0000000000a1' $$,
  'P0001',
  null,
  'an anonymized row cannot be modified');

-- ── 6. The email channel needs a subject ────────────────────────────────────
-- A row with neither an account nor an address evidences that *somebody* asked
-- for *something*, which is not evidence. The CHECK backs this up, but the RPC
-- rejects it first so the operator gets a sentence rather than a constraint name.

select set_config('request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-0000000000f9","role":"authenticated","app_metadata":{"role":"admin"}}', true);

select throws_ok(
  $$ select public.admin_log_dsr_request('access', 'passport check', null, '   ') $$,
  'admin_log_dsr_request: a request needs a subject — an account id or an email address',
  'an email-channel request with no subject at all is refused');

-- ── 7. The guard lets the retention purge through ───────────────────────────
-- §4 invariant 2: an append-only guard that does not sanction the one deletion
-- the schema requires is a deadlock, and that has already bitten this codebase
-- twice. Without this the 7-year purge would raise on every run, and the only
-- symptom would be a retention period silently not being enforced.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.dsr_requests (request_type, channel, subject_email, identity_verification, received_at)
values ('access', 'email', 'ancient@example.invalid', 'email round-trip', now() - interval '12 years');

select lives_ok(
  $$ select private.purge_expired_retention() $$,
  'the retention purge runs with an expired dsr_requests row present');

select is_empty(
  $q$ select id from public.dsr_requests where subject_email = 'ancient@example.invalid' $q$,
  'a request past the 7-year horizon is purged');

select * from finish();
rollback;
