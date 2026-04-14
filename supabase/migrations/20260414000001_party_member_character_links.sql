-- Migration: party_member_character_links
-- Add species_id and background/background_id FK columns to party_members

alter table party_members
  add column if not exists species_id uuid references species(id) on delete set null,
  add column if not exists background text,
  add column if not exists background_id uuid references backgrounds(id) on delete set null;
