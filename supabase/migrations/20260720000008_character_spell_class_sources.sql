-- A multiclass character may know or prepare the same spell through more than
-- one class. Keep each granting class as a distinct row so casting ability,
-- preparation, and removal can be resolved against the correct source.
alter table public.character_spells
  drop constraint if exists character_spells_party_member_spell_source_key;

create unique index if not exists character_spells_party_member_spell_source_class_key
  on public.character_spells (
    party_member_id,
    spell_id,
    source_type,
    coalesce(source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
