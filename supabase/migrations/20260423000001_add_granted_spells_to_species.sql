-- Migration: add_granted_spells_to_species
-- Adds a granted_spells JSONB column to the species table for auto-populating innate spells on character creation

alter table species
  add column if not exists granted_spells jsonb not null default '[]'::jsonb;
