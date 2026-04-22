-- Add page_size and ink_friendly columns to scriptorium_documents
-- page_size: A4 (default), A5, or Letter
-- ink_friendly: strip background fills and decorative images on export

alter table scriptorium_documents
  add column if not exists page_size text not null default 'A4',
  add column if not exists ink_friendly boolean not null default false;
