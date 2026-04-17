-- Migration: party_member_concentration
-- Adds a jsonb column to party_members tracking the spell a character is concentrating on.

alter table party_members
  add column if not exists concentration jsonb;

comment on column party_members.concentration is
  'Nullable. Shape: { spellId: string|null, spellName: string, castAtLevel: int, startedRound: int|null, appliedEffectIds: string[] }. Represents the single spell this character is currently concentrating on.';
