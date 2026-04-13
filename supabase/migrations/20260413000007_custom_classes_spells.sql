-- Add spellcasting columns to custom_classes.
-- spell_slots already exists as jsonb (was null-typed); now properly used as number[][].
-- spells_known: 20-element int array for "known" casters (Bard, Ranger, Sorcerer, Warlock).
-- slot_recovery: 'long' (default) or 'short' (Warlock pact magic).

alter table custom_classes
  add column spells_known  jsonb,
  add column slot_recovery text not null default 'long';
