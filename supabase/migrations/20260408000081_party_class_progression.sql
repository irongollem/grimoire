-- Add class resource pools and persistent class choices to party_members.
-- These JSONB columns are written by the LevelUpWizard and consumed by player-portal
-- class-specific logic (rage uses, ki points, subclass picks, etc.).
-- Individual class sub-tickets (#84-#96) will populate their respective keys.

alter table party_members
  add column if not exists class_resources jsonb not null default '{}',
  add column if not exists class_choices   jsonb not null default '{}';
