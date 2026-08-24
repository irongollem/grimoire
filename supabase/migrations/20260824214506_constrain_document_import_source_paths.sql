-- Migration: constrain_document_import_source_paths
--
-- Security fix for the document importer (#353), found in review before the
-- feature shipped. `document_imports.source_paths` is a client-written text[],
-- and nothing constrained its contents.
--
-- ── The hole ─────────────────────────────────────────────────────────────────
--
-- The `import-extract` edge function reads those paths with the **service-role**
-- client, which by design bypasses the storage RLS that confines a user to their
-- own `{userId}/` prefix. So the per-user storage policies added in
-- 20260824204224 protected only *direct* client access; they never applied to
-- the one code path that actually opens the file.
--
-- The concrete exploit, needing nothing but an ordinary account:
--
--   1. Create a campaign. The `campaigns_create_dm_membership` trigger makes you
--      its DM, so `private.is_campaign_dm` passes.
--   2. Insert a `document_imports` row for that campaign with your own user_id —
--      satisfying the old policy in full — but set
--      `source_paths = '{"<another-user-uuid>/<file-uuid>.pdf"}'`.
--   3. Call `import-extract` with the row id. Its ownership check passes: the
--      row genuinely is yours.
--   4. The function downloads the *other user's* document, sends it to the
--      model, and writes the extracted contents into your row, which you can
--      then read.
--   5. On settle it deletes the source objects — destroying the other user's
--      file.
--
-- That is an arbitrary read *and* an arbitrary delete over every object in the
-- bucket, gated only on knowing a path. The uuids make guessing impractical, but
-- obscurity is not an access control, and the delete is destructive regardless.
--
-- ── The fix, in two layers ───────────────────────────────────────────────────
--
-- The edge function now refuses any path outside the caller's own prefix before
-- it opens or deletes anything — that is the control that actually runs. This
-- migration is the second layer: the bad row cannot be created in the first
-- place, so a future caller of the same table (a re-extract endpoint, a batch
-- job, an admin tool) inherits the guarantee instead of having to remember it.
--
-- **UPDATE is constrained too, and that is not optional.** The original UPDATE
-- policy had no `WITH CHECK` clause at all, only a `USING` — so it permitted a
-- row to be *changed* into a state the INSERT policy would have rejected.
-- Tightening INSERT alone would have been trivially bypassed: insert a row with
-- legitimate paths, then update `source_paths` to point wherever you like.

-- ── 1. The predicate ─────────────────────────────────────────────────────────
--
-- Lives in `private`, not `public`, per the CLAUDE.md rule: a function used
-- inside an RLS policy must not be reachable as a PostgREST RPC. It is plain
-- SECURITY INVOKER — unlike the `is_campaign_*` helpers it reads no tables, only
-- its argument and `auth.uid()`, so it needs no elevated privileges and does not
-- grow the security-advisor's definer count.
--
-- Total by construction: `bool_and` over an empty array yields NULL, so the
-- result is coalesced to false at the source rather than at each call site —
-- the lesson from the `is_app_admin` NULL bypass. An absent `auth.uid()` also
-- yields false, because `null::text || '/%'` is NULL and `like NULL` is NULL.
-- Deny is the correct answer in both cases.
create or replace function private.paths_under_caller_prefix(paths text[])
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    bool_and(
      -- Confined to the caller's own folder...
      p like (auth.uid()::text || '/%')
      -- ...and no traversal segment that could climb back out of it. Storage
      -- keys are not filesystem paths, but the key is echoed into other systems
      -- (the CDN, cleanup jobs) and a '..' has no legitimate use here.
      and p not like '%..%'
    ),
    false
  )
  from unnest(paths) as p
$$;

comment on function private.paths_under_caller_prefix(text[]) is
  'True when every storage key in the array sits under the calling user''s own '
  '{auth.uid()}/ prefix. Guards document_imports.source_paths, which is read by '
  'the import-extract edge function with the service-role client — a context '
  'where storage RLS does not apply. See migration 20260824214506.';

-- ── 2. Apply it to both write paths ──────────────────────────────────────────
drop policy if exists "document_imports_insert" on document_imports;
create policy "document_imports_insert" on document_imports for insert
  with check (
    auth.uid() = user_id
    and private.is_campaign_dm(campaign_id)
    and private.paths_under_caller_prefix(source_paths)
  );

-- USING governs which rows may be targeted; WITH CHECK governs what they may be
-- changed *into*. The original had only the former, which is what made the
-- INSERT-only version of this fix insufficient.
drop policy if exists "document_imports_update" on document_imports;
create policy "document_imports_update" on document_imports for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and private.paths_under_caller_prefix(source_paths)
  );
