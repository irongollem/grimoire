-- The running title a book prints on its right-hand pages (#1176 story 6).
--
-- A printed book carries the book's title on the left page and the chapter's
-- on the right. `footer_title` chooses the right page's: the chapter's title
-- (the default for every book from now on), the book's, or `footer_text` typed
-- by the DM. A book that already had footer text keeps printing it, so it
-- starts on 'custom'.

alter table public.scriptorium_documents
  add column footer_title text not null default 'chapter'
  constraint scriptorium_documents_footer_title_check check (footer_title in ('chapter', 'book', 'custom'));

update public.scriptorium_documents set footer_title = 'custom' where footer_text <> '';
