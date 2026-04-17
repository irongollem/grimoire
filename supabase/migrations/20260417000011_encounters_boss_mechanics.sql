-- Migration: encounters_boss_mechanics
-- Adds DM-authored boss-fight settings to encounters. Lair actions fire at
-- initiative 20 each round when enabled, sourced from the lair owner's
-- monster stat_block.lair_actions array.
--
-- `lair_owner_def_id` references one of this encounter's combatant defs
-- (the `id` field inside encounters.combatants[]). We store it as plain
-- text rather than a FK — combatant defs live inside a jsonb array, not
-- in their own table.

alter table encounters
  add column if not exists lair_enabled       boolean not null default false,
  add column if not exists lair_owner_def_id  text;

comment on column encounters.lair_owner_def_id is
  'References encounters.combatants[*].id — which combatant in this encounter owns the lair. Null means the DM has enabled lair actions but not yet picked an owner; the runner hides the lair card until set.';
