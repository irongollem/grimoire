-- Paste a page and get a beat graph. Story #829.
--
-- The document importer (#353) only accepts uploads: a PDF or a stack of page
-- photos, both of which go to storage and come back to the extractor as images.
-- The maintainer's actual ask is simpler and cheaper — paste the text of an
-- adventure page straight in. No upload, no vision pass, no storage object.
--
-- ── Why a third source_kind rather than a second table ──────────────────────
--
-- Everything downstream of extraction is identical: the same credit charge, the
-- same review wizard, the same `extracted` jsonb, the same 24-hour `expires_at`
-- sweep. Only the way the bytes arrive differs. A parallel table would fork all
-- of that to change one field.
--
-- ── page_count is derived, not declared, and that is the security property ───
--
-- `limits.ts` documents why the page cap exists, and only one of the two reasons
-- is cost. The other is the EU sui generis database right (Directive 96/9/EC),
-- which protects a compiled database — a bestiary, a gazetteer — against
-- extraction of a *substantial part*, independently of copyright in any single
-- entry. The cap is what keeps every import on the right side of that line.
--
-- A paste box with a client-declared page count would be a way straight around
-- it: send `page_count = 1` with a megabyte of text and the ceiling never fires.
-- So the check below binds the two together — a text import must declare at
-- least as many pages as its own length implies. Combined with the existing
-- `page_count <= 50`, that caps pasted text at ~175,000 characters, and the
-- limit is a property of the row rather than a promise the client keeps.
--
-- TEXT_CHARS_PER_PAGE is mirrored in src/lib/documentImport/limits.ts. The
-- client rounds up the same way; a client that rounds *down* fails this check
-- rather than silently under-paying, which is the direction the mismatch
-- should break in.

alter table public.document_imports
  add column if not exists source_text text;

comment on column public.document_imports.source_text is
  'The pasted source for a source_kind = ''text'' import (#829). Null for the '
  'upload kinds, which carry their bytes in storage under source_paths. Swept '
  'with the row by the expires_at cleanup — this holds publisher-copyrighted '
  'text the DM owns a copy of, so it is private to the importing account and '
  'never promoted to library_* or reused as seed data.';

alter table public.document_imports
  drop constraint if exists document_imports_source_kind_check,
  add constraint document_imports_source_kind_check
    check (source_kind in ('pdf', 'images', 'text'));

-- Subsumed by the shape check below rather than kept alongside it: 'text' is
-- the first kind with legitimately zero paths, so a standalone "always > 0"
-- rule is now simply wrong, and two rules describing one fact is how the next
-- reader ends up unsure which is authoritative.
alter table public.document_imports
  drop constraint if exists document_imports_source_paths_check;

alter table public.document_imports
  drop constraint if exists document_imports_source_shape_check,
  add constraint document_imports_source_shape_check check (
       (source_kind = 'pdf'
          and cardinality(source_paths) = 1
          and source_text is null)
    or (source_kind = 'images'
          and cardinality(source_paths) = page_count
          and source_text is null)
    or (source_kind = 'text'
          and cardinality(source_paths) = 0
          and source_text is not null
          and btrim(source_text) <> ''
          and page_count >= ceil(char_length(source_text)::numeric / 3500))
  );
