-- Grimoire, the Scriptorium's own book look, and the default for a new book (#1176).
--
-- Beside the 2024 and 2014 books there is now a third book look, the house
-- one: rag paper, iron-gall ink, oxblood rubrics, gilt hairlines, its own stat
-- block. A new document starts on it; existing documents keep the look they
-- have. The client's look registry (src/scriptorium/lib/looks.ts) names the
-- same ids.

alter table public.scriptorium_documents
  drop constraint scriptorium_documents_theme_check;

alter table public.scriptorium_documents
  add constraint scriptorium_documents_theme_check
  check (theme = any (array['grimoire', 'onednd2024', 'phb2014', 'letter', 'notice', 'journal', 'plain']));

alter table public.scriptorium_documents
  alter column theme set default 'grimoire';
