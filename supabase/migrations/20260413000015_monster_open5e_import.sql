-- Migration: monster_open5e_import
-- Adds Open5e runtime-import metadata to `monsters` so users can sync
-- creatures from any open-licensed document (Tome of Beasts, Creature Codex,
-- etc.) the same way spells already sync.

alter table monsters add column if not exists open5e_import boolean not null default false;
alter table monsters add column if not exists source_title  text;
alter table monsters add column if not exists source_url    text;

-- Index to make "fetch existing monsters I've imported" lookups fast during sync.
create index if not exists monsters_open5e_import_idx on monsters (user_id, open5e_import);
