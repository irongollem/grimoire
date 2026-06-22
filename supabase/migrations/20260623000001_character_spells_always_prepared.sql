-- Migration: character_spells_always_prepared
-- Adds always_prepared to character_spells. Always-prepared spells (oath/domain/
-- circle/subclass-granted spells) are prepared automatically and do NOT count
-- against the character's prepared-spell limit. They cannot be unprepared or
-- removed by the player. Fixes the "free spells counted toward the limit" bug.

alter table public.character_spells
  add column if not exists always_prepared boolean not null default false;

-- An always-prepared spell is, by definition, prepared.
alter table public.character_spells
  add constraint character_spells_always_prepared_implies_prepared
  check (not always_prepared or is_prepared);
