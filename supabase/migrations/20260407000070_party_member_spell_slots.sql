-- Add spell_slots column to party_members
-- Stores per-level slot tracking: [{level: 1, max: 4, used: 2}, ...]
alter table party_members
  add column if not exists spell_slots jsonb not null default '[]'::jsonb;
