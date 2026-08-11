begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- Cover for the GDPR access & portability export (#632, 20260811130935).
-- Companion to context/compliance/data-subject-rights.md §4e.
--
-- The thing worth testing here is NOT "does it return notes" — it is that the
-- export cannot quietly stop covering something. An export that omits a table
-- is not a visibly broken feature; it returns a large, plausible JSON document
-- and an unlawful answer to an Art. 15 request. So the assertions below are
-- mostly structural, aimed at the two ways coverage can rot: a new table the
-- function never learns about, and a redaction rule that stops matching.

-- ── 1. The service_role gate ────────────────────────────────────────────────
-- export_user_data reads every table for an arbitrary uuid. `authenticated`
-- holding EXECUTE would be a whole-account read of anyone's data by user id,
-- and would also route around the edge function's rate limit, which is the only
-- bound on how often a full dump can be built.

select ok(
  not has_function_privilege('authenticated', 'public.export_user_data(uuid)', 'EXECUTE'),
  'authenticated cannot execute export_user_data');

select ok(
  not has_function_privilege('anon', 'public.export_user_data(uuid)', 'EXECUTE'),
  'anon cannot execute export_user_data');

select ok(
  has_function_privilege('service_role', 'public.export_user_data(uuid)', 'EXECUTE'),
  'service_role can execute export_user_data');

-- The grant is one half; the function refuses on its own too, so a future
-- `drop function` + `create` (which resets the ACL to the PUBLIC default — the
-- exact route #650 took) cannot silently open it.
--
-- Asserted while holding EXECUTE rather than by switching to `authenticated`:
-- the ACL is checked before the body runs, so an `authenticated` caller gets
-- `permission denied` and never reaches the guard, which would make this test
-- pass on the grant alone and prove nothing about the guard.
select set_config('request.jwt.claims',
  '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.export_user_data('32000000-0000-4000-8000-000000000001') $$,
  'export_user_data can only be called by service_role',
  'the function refuses a non-service_role caller even when the caller holds EXECUTE');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── 2. Coverage: the export sees every table erasure reaches ────────────────
-- The function derives its table set at runtime from the auth.users FK graph,
-- so it cannot drift from that graph by construction. What it CAN drift from is
-- the other half of erasure: the rows no FK reaches, which prepare_user_erasure
-- clears by hand and export_user_data must list by hand for the same reason.
--
-- These two assertions are the actual invariant of #632. If a future migration
-- adds a user-keyed table with no FK to auth.users, it must be added to BOTH
-- functions, and the first of these fails until it is.

create temp view unreferenced_user_tables as
  select c.table_name
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and c.column_name = 'user_id'
    and not exists (
      select 1
      from pg_constraint con
      join unnest(con.conkey) with ordinality k(attnum, ord) on true
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      where con.contype = 'f'
        and con.confrelid = 'auth.users'::regclass
        and con.conrelid = ('public.' || c.table_name)::regclass
        and a.attname = 'user_id'
    );

-- Pinned, and this assertion is the one that keeps the next two honest. They
-- are `is_empty` over this set, so an empty set passes them both vacuously —
-- and the set becomes empty the moment someone gives rate_limit_events an FK,
-- at which point two green tests would be asserting nothing at all.
select set_eq(
  'select table_name::text from unreferenced_user_tables',
  $$ values ('rate_limit_events') $$,
  'exactly one user-keyed table has no auth.users FK, and it is the known one');

select is_empty(
  $q$
    -- Each such table is invisible to the FK loop and must be named explicitly
    -- in export_user_data.
    select table_name from unreferenced_user_tables
    where (select prosrc from pg_proc where proname = 'export_user_data') not like '%' || table_name || '%'
  $q$,
  'every user-keyed table with no auth.users FK is named explicitly in export_user_data');

select is_empty(
  $q$
    -- ...and the same set is cleared by prepare_user_erasure. Asserted in both
    -- directions: a table the export lists but erasure does not clear is data
    -- handed to the subject and then kept after they asked for it to go.
    select table_name from unreferenced_user_tables
    where (select prosrc from pg_proc where proname = 'prepare_user_erasure') not like '%' || table_name || '%'
  $q$,
  'the same set is cleared by prepare_user_erasure — export and erasure agree on what has no FK');

-- ── 3. Redaction ────────────────────────────────────────────────────────────
-- The predicate is what stands between a downloaded file and a working BYOK key
-- or campaign invite. Both directions matter: `input_tokens` on the credit
-- ledger is a billing count, and a `%token%` rule would redact the usage
-- history — the most useful numbers in the export — to protect nothing.

select ok(private.is_credential_column('gemini_api_key'), 'a BYOK key column is a credential');
select ok(private.is_credential_column('ical_token'), 'a calendar-feed token is a credential');
select ok(private.is_credential_column('token'), 'a bare token column is a credential');
select ok(not private.is_credential_column('input_tokens'), 'a token COUNT is not a credential');
select ok(not private.is_credential_column('battle_map_show_tokens'), 'a battle-map setting is not a credential');

-- ── 4. Behaviour: two accounts, and the export of one is not the other ──────
-- The FK loop keys on a uuid, so the failure this guards against is not subtle
-- filtering — it is a mistake in the generated predicate that returns the whole
-- table. Cheap to assert, and it would be a total disclosure of every account.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('32000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'export-a@example.invalid', '', now(), now()),
  ('32000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'export-b@example.invalid', '', now(), now());

-- `ical_token` defaults to a generated uuid and is NOT NULL, so one ordinary
-- campaign row carries a real credential to redact. Deliberately not
-- `gemini_api_key`: setting one trips enforce_byok_pro_only(), and making the
-- fixture account Pro to satisfy an unrelated trigger would be fighting the
-- schema to test a rule that applies to every credential column equally.
insert into public.campaigns (id, user_id, name)
values
  ('32000000-0000-4000-8000-0000000000a2', '32000000-0000-4000-8000-0000000000a1', 'A''s campaign'),
  ('32000000-0000-4000-8000-0000000000b2', '32000000-0000-4000-8000-0000000000b1', 'B''s campaign');

select is(
  (select jsonb_array_length(public.export_user_data('32000000-0000-4000-8000-0000000000a1') -> 'tables' -> 'campaigns')),
  1,
  'A''s export contains exactly A''s one campaign');

select is(
  (select public.export_user_data('32000000-0000-4000-8000-0000000000a1')
            -> 'tables' -> 'campaigns' -> 0 ->> 'ical_token'),
  '[redacted]',
  'a stored credential is replaced by the redaction marker, not exported');

-- A null credential stays null rather than becoming "[redacted]": "no key was
-- ever set" and "a key is withheld" are different facts about the account, and
-- the subject is entitled to the first one.
select is(
  (select public.export_user_data('32000000-0000-4000-8000-0000000000a1')
            -> 'tables' -> 'campaigns' -> 0 ->> 'gemini_api_key'),
  null,
  'an unset credential stays null rather than being reported as redacted');

select * from finish();
rollback;
