-- Migration: custom_subclasses_granted_spells
-- Adds granted_spells to custom_subclasses: spells the subclass grants
-- automatically and always-prepared (oath / domain / circle spells), keyed by
-- the level at which they're gained. Mirrors the `features` jsonb shape:
--   { "3": ["srd_speak_with_animals", "<custom-uuid>"], "5": ["srd_misty_step"] }
-- Spell ids may reference srd_spells.id (srd_* slug) or spells.id (custom uuid).
-- On level-up these are written to character_spells with always_prepared = true.

alter table public.custom_subclasses
  add column if not exists granted_spells jsonb not null default '{}'::jsonb;
