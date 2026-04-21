-- Migration: scriptorium_theme
-- Add theme column to scriptorium_documents for per-document OneDnD 2024 / classic PHB 2014 selection

alter table public.scriptorium_documents
  add column if not exists theme text not null default 'onednd2024'
    check (theme in ('onednd2024', 'phb2014'));
