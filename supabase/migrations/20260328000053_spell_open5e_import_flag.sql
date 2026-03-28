-- Add internal flag to identify spells imported from open5e.
-- Used for re-import dedup/update logic; not exposed in UI.
alter table spells
  add column if not exists open5e_import boolean not null default false;

-- Mark all existing imported spells (they all have source = 'srd' from the old importer)
update spells set open5e_import = true where source = 'srd';
