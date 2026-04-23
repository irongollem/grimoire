-- Migration: add_innate_spellcasting_to_character_spells
-- Adds source tracking and per-day use counting to character_spells for racial/feat/item innate spells

-- New columns
alter table character_spells
  add column if not exists source_type    text    not null default 'class',
  add column if not exists uses_per_day   integer,
  add column if not exists uses_remaining integer,
  add column if not exists resets_on      text,
  add column if not exists source_label   text;

-- Value constraints
alter table character_spells
  add constraint character_spells_source_type_check
    check (source_type in ('class', 'racial', 'feat', 'item', 'other'));

alter table character_spells
  add constraint character_spells_resets_on_check
    check (resets_on in ('long_rest', 'short_rest'));

-- Replace the (party_member_id, spell_id) unique constraint with (party_member_id, spell_id, source_type)
-- so the same spell can exist as both a class spell and a racial/feat/item innate spell.
alter table character_spells
  drop constraint if exists character_spells_party_member_id_spell_id_key;

alter table character_spells
  add constraint character_spells_party_member_spell_source_key
    unique (party_member_id, spell_id, source_type);
