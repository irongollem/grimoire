begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- Regression cover for the storage-path escape found reviewing #353 chunk 2 and
-- fixed in 20260824214506.
--
-- `document_imports.source_paths` is a client-written text[], and the
-- `import-extract` edge function reads those keys with the **service-role**
-- client — which bypasses storage RLS by design. The per-user storage policies
-- from 20260824204224 therefore protected direct client access only, and never
-- the one code path that actually opens the file. A user could create a campaign
-- (becoming its DM via the `campaigns_create_dm_membership` trigger), stage a
-- row naming another user's object, and have the function read that object out
-- and then delete it: an arbitrary read and an arbitrary delete over the bucket.
--
-- Why this file exists rather than trusting the migration: the migration asserts
-- nothing, and both policies it rewrote are the kind that get recreated by a
-- later migration touching the same table. A policy restored without the
-- `paths_under_caller_prefix` term reopens the hole silently — no error, no
-- advisor finding, nothing failing. These tests fail instead.

-- ── The predicate itself ─────────────────────────────────────────────────────
--
-- Exercised directly, because the two policy tests below can only prove the term
-- is wired in — not that it decides correctly. Both halves matter: a predicate
-- that denied everything would "pass" a security review while silently breaking
-- the feature for every legitimate user.

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select ok(
  private.paths_under_caller_prefix(array['11111111-1111-1111-1111-111111111111/doc.pdf']),
  'own-prefix path is allowed (the feature still works)'
);

select ok(
  private.paths_under_caller_prefix(array[
    '11111111-1111-1111-1111-111111111111/p1.jpg',
    '11111111-1111-1111-1111-111111111111/p2.jpg'
  ]),
  'a multi-page batch entirely under the caller prefix is allowed'
);

select ok(
  not private.paths_under_caller_prefix(array['22222222-2222-2222-2222-222222222222/secret.pdf']),
  'another user''s prefix is denied'
);

-- The interesting one: all-or-nothing. A per-element check that stopped at the
-- first match would pass this and leak the second file.
select ok(
  not private.paths_under_caller_prefix(array[
    '11111111-1111-1111-1111-111111111111/mine.pdf',
    '22222222-2222-2222-2222-222222222222/theirs.pdf'
  ]),
  'one foreign path among own paths denies the whole array'
);

select ok(
  not private.paths_under_caller_prefix(array[
    '11111111-1111-1111-1111-111111111111/../22222222-2222-2222-2222-222222222222/x.pdf'
  ]),
  'a traversal segment is denied'
);

-- `like '<uuid>/%'` requires the separator immediately after the uuid, so a
-- bucket folder that merely *starts with* the caller's id does not match.
select ok(
  not private.paths_under_caller_prefix(array['11111111-1111-1111-1111-111111111111-evil/x.pdf']),
  'a prefix-confusion folder is denied'
);

select ok(
  not private.paths_under_caller_prefix(array['secret.pdf']),
  'a bare filename at the bucket root is denied'
);

-- ── Totality ─────────────────────────────────────────────────────────────────
--
-- `bool_and` over an empty array is NULL, and an anonymous caller's `auth.uid()`
-- is NULL. Both must read as false, not NULL: the `is_app_admin` bypass in
-- CLAUDE.md happened because a guard returned NULL and `not NULL` never fired.
select ok(
  private.paths_under_caller_prefix(array[]::text[]) is false,
  'empty array returns false, never NULL'
);

reset role;
set local request.jwt.claims = '{}';
select ok(
  private.paths_under_caller_prefix(array['anything/x.pdf']) is false,
  'absent auth.uid() returns false, never NULL'
);

-- ── The policies actually carry the term ─────────────────────────────────────
--
-- Body-based, deliberately. An outcome test only covers the write paths someone
-- remembered to write a case for; what went wrong here was a write path nobody
-- had constrained at all. Asserting the term is present in both policies catches
-- a future migration that recreates either one without it.

select ok(
  (select pg_get_expr(polwithcheck, polrelid)
     from pg_policy
    where polrelid = 'public.document_imports'::regclass
      and polname = 'document_imports_insert') like '%paths_under_caller_prefix%',
  'INSERT policy constrains source_paths'
);

-- The UPDATE policy is the half that is easy to forget: before the fix it had a
-- USING clause and no WITH CHECK at all, so a row could be *changed* into a
-- state INSERT would have rejected. Constraining INSERT alone was bypassable by
-- inserting legitimate paths and then updating them.
select ok(
  (select pg_get_expr(polwithcheck, polrelid)
     from pg_policy
    where polrelid = 'public.document_imports'::regclass
      and polname = 'document_imports_update') like '%paths_under_caller_prefix%',
  'UPDATE policy constrains source_paths (it had no WITH CHECK before the fix)'
);

-- ── Staged source shape ──────────────────────────────────────────────────────
-- The extractor parses PDF bytes itself, but image page count can and should be
-- made authoritative at the client-write boundary: one path is one page.
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_imports'::regclass
      and conname = 'document_imports_source_shape_check'
  ),
  'document imports carry a source-shape constraint'
);

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.document_imports'::regclass
      and conname = 'document_imports_source_shape_check') like '%cardinality(source_paths) = page_count%',
  'image page count is tied to the number of staged image paths'
);

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.document_imports'::regclass
      and conname = 'document_imports_page_count_ceiling_check') like '%page_count <= 50%',
  'the absolute page ceiling is enforced in the database'
);

select * from finish();
rollback;
