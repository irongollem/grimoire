-- A new drawing's layers no longer carry `area` (#1125). The round brush makes
-- real walls now: a brushed outline is a run of smooth angled walls in
-- `layers.walls`, and its floor is plain squares, so the per-square coverage
-- mask layer is gone. Drawings saved with an `area` layer are converted to
-- walls by the client the first time they are read, and written back once.
-- The default also gains `walls` and `lights`, which every drawing has had
-- since 20261101213552; the client filled them on read until now.
alter table public.dungeon_maps alter column layers set default
  '{"floor": {}, "solidBlock": {}, "terrain": {}, "object": {}, "annotation": {}, "dressing": {}, "walls": {}, "lights": {}}'::jsonb;
