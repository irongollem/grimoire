-- Migration: scriptorium_page_furniture
-- Phase D (#456): add the page-furniture layer to Scriptorium documents.
-- Decorations (watercolours, watermarks, artist credits, free art) move out of
-- the Tiptap content stream into this sibling JSONB column so they can be
-- anchored to a page/block and dragged on the rendered book. Shape:
--   PageFurnitureItem[] = [{ id, kind, anchor, x, y, width, z, props }]
-- Additive, non-breaking; existing rows default to an empty array.

alter table scriptorium_documents
  add column if not exists page_furniture jsonb not null default '[]'::jsonb;
