-- A pasted import has no paths to prefix. Fixes #829.
--
-- `20260906213100` added `source_kind = 'text'`: a DM pastes a page and the
-- import carries its source in `source_text` with **no storage objects**, so
-- `source_paths` is empty by construction and the shape CHECK requires it.
--
-- Both RLS policies on `document_imports` gate on
-- `private.paths_under_caller_prefix(source_paths)`, which returns **false**
-- for an empty array — deliberately, and correctly, for the two upload kinds:
-- an import with no objects is not an upload, and the predicate exists to stop
-- a caller claiming paths under someone else's prefix.
--
-- The consequence is that the paste feature never worked at all. Not "could not
-- save progress" — a text row could not be **inserted**, because the INSERT
-- policy carries the same predicate. The feature shipped inert.
--
-- ── Why no gate caught it ──────────────────────────────────────────────────
--
-- Worth writing down, because it is the third time this epic has met the same
-- shape. RLS is data-layer: `vue-tsc` cannot see it, the client tests mock the
-- Supabase client, and `npm run build` never touches a database. The pgTAP
-- suite could have caught it and did not, because
-- `document_import_source_paths.test.sql` predates the third source kind and
-- tests only the two that carry paths. Cover is added there in the same change.
--
-- ── The predicate ──────────────────────────────────────────────────────────
--
-- Both halves are stated rather than relying on one to imply the other:
--
--   * `source_kind = 'text'` names *why* an empty array is allowed, so the next
--     reader does not have to infer it from a cardinality;
--   * `cardinality(source_paths) = 0` makes the exemption total on its own,
--     rather than resting on `document_imports_source_shape_check` being
--     evaluated first. A row claiming `text` while carrying paths gets no
--     bypass here even if that CHECK were ever relaxed.
--
-- The upload kinds are unchanged: `pdf` and `images` still have to prove every
-- path sits under the caller's own prefix.

alter policy document_imports_insert on public.document_imports
  with check (
    auth.uid() = user_id
    and private.is_campaign_dm(campaign_id)
    and (
      private.paths_under_caller_prefix(source_paths)
      or (source_kind = 'text' and cardinality(source_paths) = 0)
    )
  );

alter policy document_imports_update on public.document_imports
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      private.paths_under_caller_prefix(source_paths)
      or (source_kind = 'text' and cardinality(source_paths) = 0)
    )
  );
