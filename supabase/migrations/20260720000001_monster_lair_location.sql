-- Migration: monster_lair_location
-- #168 — add an optional lair/habitat location link to user monsters so the
-- MonsterSheet can render a navigable "Lair" link next to the free-text
-- habitat field. SRD monsters (srd_monsters) are shared content and get no FK;
-- the link only exists on user-owned rows.

alter table monsters
  add column lair_location_id uuid references locations(id) on delete set null;

create index monsters_lair_location_idx on monsters (lair_location_id);
