-- Migration: constrain_document_import_shape
--
-- Keeps the client-written staging metadata internally consistent before the
-- service-role extractor ever opens an object.
--
-- `page_count` is written by the browser and read by two things that matter:
-- the credit charge (`document_import_page` x page_count) and the plan cap. A
-- staged `page_count` of 1 against a fifty-page PDF therefore bought a fifty-
-- page extraction for two credits and walked past the free tier's limit. The
-- extractor now re-derives the real count from the bytes, and these constraints
-- close the half of it that SQL can decide on its own:
--
--   * A PDF import is exactly one object. Page count still needs the parser.
--   * An image import is one object per page by definition, so the two must
--     agree and the database can say so.
--
-- The ceiling is deliberately a constant and not a lookup. It mirrors
-- `PRO_PAGE_LIMIT` in `src/lib/documentImport/limits.ts` as an absolute
-- backstop — the plan-aware limit (10 free / 50 Pro) is enforced in the
-- extractor, which is the only place that knows whose plan applies. Move one
-- and the other has to move with it.
alter table document_imports
  add constraint document_imports_source_shape_check check (
    (source_kind = 'pdf' and cardinality(source_paths) = 1)
    or
    (source_kind = 'images' and cardinality(source_paths) = page_count)
  ),
  add constraint document_imports_page_count_ceiling_check check (page_count <= 50);
