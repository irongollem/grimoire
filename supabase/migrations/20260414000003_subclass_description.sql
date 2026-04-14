-- Migration: subclass_description
-- Add description column to custom_subclasses for storing flavour text (imported from Open5e or manually authored)

alter table custom_subclasses
  add column if not exists description text;
