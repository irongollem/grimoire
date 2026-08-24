-- Migration: document_import_index_covers_failed
--
-- Extends the importer's lookup index to cover `failed` rows, because the client
-- now has to find them.
--
-- The original index (20260824204224) was predicated on
-- `status in ('pending','extracting','review')` — "does this user have an import
-- to resume". That looked right and made a failed extraction invisible: the
-- client query mirrored the predicate, so a row that failed simply stopped being
-- returned, and the tab fell back to a blank upload form with no explanation.
--
-- At this feature's price that is not acceptable. An extraction costs base + 12
-- per page — a ten-page chapter is ~121 credits, a fifty-page one ~601 — and the
-- edge function deletes the source document once it settles either way. So a DM
-- whose extraction failed had spent real credits, lost their upload, and been
-- shown nothing at all on the next page load. `document_imports.error` exists
-- precisely to be read; nothing was reading it.
--
-- `complete` stays out. A finished import has nothing to resume and nothing to
-- explain, and keeping it in the predicate would mean a successful import
-- blocked the next one until it was manually dismissed.
--
-- Rebuilt rather than amended because a partial index's predicate cannot be
-- altered in place.
drop index if exists document_imports_user_campaign_idx;

create index document_imports_user_campaign_idx
  on document_imports (user_id, campaign_id)
  where status in ('pending', 'extracting', 'review', 'failed');
