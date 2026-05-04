-- Migration: character_spells_spell_id_to_text
-- spell_id was uuid (FK to spells); now text to also support srd_* slugs from srd_spells.
-- Existing UUID values cast cleanly to text — no data loss.

alter table character_spells drop constraint if exists character_spells_spell_id_fkey;
alter table character_spells alter column spell_id type text using spell_id::text;
