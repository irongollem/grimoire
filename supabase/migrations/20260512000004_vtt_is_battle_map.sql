-- Migration: vtt_is_battle_map
-- Adds an explicit "tactical battle map" flag on locations so battle maps
-- can be hidden from the player atlas regardless of is_map_shared. Fog of
-- war and grid-snap drag only ever apply when this flag is true.

alter table locations
  add column if not exists is_battle_map boolean not null default false;
