-- Migration: add_level_choices_to_party_members
-- Adds a level_choices JSONB column to party_members for reversible level-up history

alter table party_members
  add column if not exists level_choices jsonb not null default '{}';
