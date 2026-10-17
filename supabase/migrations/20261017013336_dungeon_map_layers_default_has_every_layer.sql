-- Migration: dungeon_map_layers_default_has_every_layer
-- A new map's layers start with every layer the Cartographer draws, the brushed areas among them (#1073, story 8).
--
-- `withLayerDefaults` (src/types/dungeonMap.types.ts) reads a missing layer as empty, so an older row lacking a newer
-- key still loads. Its comment says the column default carries every key for new rows, and it had fallen behind: the
-- water layer (`terrain`) was never added to it. This brings the default level with the client's `emptyLayers()`,
-- including `area`, the brushed areas of story 8 (a sub-cell coverage mask per cell, drawn as smooth shapes).

alter table public.dungeon_maps alter column layers set default
  '{"floor": {}, "solidBlock": {}, "terrain": {}, "object": {}, "annotation": {}, "dressing": {}, "area": {}}'::jsonb;
