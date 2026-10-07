-- Migration: archive_document_imports
-- A wiki export becomes a fourth import source, read without AI (#932, story 6).
--
-- A DM moving from LegendKeeper, World Anvil or Obsidian drops the export (a
-- zip, or loose .md / .html files) on the import tab. The browser reads it:
-- one exported page is one record, its kind guessed from the folder, the
-- frontmatter or the article template and settled by the DM, its body kept
-- whole as rich text, its [[links]] turned into @mentions. Nothing is sent to
-- a model and nothing is charged. The row exists so the review gets the same
-- dedupe candidates (`import-match`, keyed on a row the caller owns) and the
-- same expiry cleanup as every other import.
--
-- Three things differ from the AI kinds, and the CHECKs hold each one:
--
-- 1. No source object and no source text. The parsed pages arrive in
--    `extracted`, written by the client at insert time with status `review`.
--    That is no wider than today: a client could already insert a `text` row
--    in `review` with whatever `extracted` it liked, and everything in it is
--    the caller's own data going into the caller's own campaign, trusted per
--    field exactly as model output is.
-- 2. No AI provenance, ever. Nothing in an archive import was generated, so
--    the rows it creates must not be marked as if it were (AI Act marking,
--    #611). `import-extract` also refuses the kind before any credit hold.
-- 3. Not bound by the 50-page ceiling. That ceiling exists because the
--    platform *extracts* (EU database right, #353; document-import.md "The
--    legal design is in the prompt"), and here nothing is extracted: the DM's
--    own pages are copied in by their own browser, as a bundle or a backup
--    restore would. The ceiling still binds every page the DM later sends to
--    AI extraction, because that goes through a `text` row. An archive row has
--    its own sanity bound so one row's `extracted` stays a sane size.

alter table public.document_imports
  drop constraint document_imports_source_kind_check;
alter table public.document_imports
  add constraint document_imports_source_kind_check
  check (source_kind = any (array['pdf'::text, 'images'::text, 'text'::text, 'archive'::text]));

alter table public.document_imports
  drop constraint document_imports_source_shape_check;
alter table public.document_imports
  add constraint document_imports_source_shape_check check (
    ((source_kind = 'pdf'::text) and (cardinality(source_paths) = 1) and (source_text is null))
    or ((source_kind = 'images'::text) and (cardinality(source_paths) = page_count) and (source_text is null))
    or ((source_kind = 'text'::text) and (cardinality(source_paths) = 0) and (source_text is not null)
        and (btrim(source_text) <> ''::text)
        and ((page_count)::numeric >= ceil(((char_length(source_text))::numeric / (3500)::numeric))))
    -- An archive's page count is the number of exported pages it carries.
    or ((source_kind = 'archive'::text) and (cardinality(source_paths) = 0) and (source_text is null))
  );

alter table public.document_imports
  drop constraint document_imports_page_count_ceiling_check;
alter table public.document_imports
  add constraint document_imports_page_count_ceiling_check check (
    case when source_kind = 'archive' then page_count <= 2000 else page_count <= 50 end
  );

alter table public.document_imports
  add constraint document_imports_archive_not_ai_check check (
    source_kind <> 'archive' or ai_provenance is null
  );

-- The insert and update policies admitted an empty `source_paths` only for
-- `text`; `paths_under_caller_prefix('{}')` is false by design. An archive has
-- no paths either.
drop policy if exists document_imports_insert on public.document_imports;
create policy document_imports_insert on public.document_imports
  for insert
  with check (
    ((select auth.uid()) = user_id)
    and private.is_campaign_dm(campaign_id)
    and (
      private.paths_under_caller_prefix(source_paths)
      or (source_kind in ('text', 'archive') and cardinality(source_paths) = 0)
    )
  );

drop policy if exists document_imports_update on public.document_imports;
create policy document_imports_update on public.document_imports
  for update
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and private.is_campaign_dm(campaign_id)
    and (
      private.paths_under_caller_prefix(source_paths)
      or (source_kind in ('text', 'archive') and cardinality(source_paths) = 0)
    )
  );
