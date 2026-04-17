-- Migration: character_spells_source_class
-- Adds a source_class_id FK so a multiclass character can track which class
-- granted each learned/prepared spell. Preparation caps and cantrips-known
-- counts are per-class in 5e RAW, so spells need to carry their source.
-- Nullable for existing rows; level-up writes the new class row's id going
-- forward.

alter table character_spells
  add column if not exists source_class_id uuid references character_classes(id) on delete set null;

create index if not exists character_spells_source_class_idx
  on character_spells (source_class_id);
