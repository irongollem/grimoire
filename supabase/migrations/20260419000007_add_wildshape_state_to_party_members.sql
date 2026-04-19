-- Migration: add_wildshape_state_to_party_members
-- Stores persistent wildshape state on the character so it survives outside of live encounters and enables per-day usage tracking

alter table public.party_members
  add column if not exists wildshape_state   jsonb    null,
  add column if not exists wildshapes_used   int      not null default 0,
  add column if not exists wildshape_reset   timestamptz null;
