-- Migration: editable_material_regions
-- Ground shapes retain editable vector boundaries independently of physical walls.
-- Existing drawings are converted by the client on read, where curve geometry
-- and tile variants can be preserved. This changes only the default for new rows.
alter table public.dungeon_maps alter column layers set default
  '{"floor": {}, "solidBlock": {}, "terrain": {}, "object": {}, "annotation": {}, "dressing": {}, "walls": {}, "lights": {}, "ground": {}}'::jsonb;
