-- Migration: scriptorium_page_numbers
-- Add page number + footer settings to scriptorium_documents (issue #225)
-- show_page_numbers: enable/disable the footer bar on every page
-- footer_text: optional text shown on the left of each numbered page
-- page_number_start: the integer to start counting from (default 1)

alter table public.scriptorium_documents
  add column if not exists show_page_numbers boolean not null default false,
  add column if not exists footer_text       text    not null default '',
  add column if not exists page_number_start integer not null default 1;
