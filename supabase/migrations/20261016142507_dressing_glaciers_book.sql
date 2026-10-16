-- Migration: dressing_glaciers_book
-- The Grimoire Glaciers Dressing book (#891): the Icy Cave set's own props, for frozen caves and glaciers.
--
-- Icy Cave draws the cave itself (snow and blue ice underfoot, ragged walls of glacial ice and frozen rock, meltwater
-- with floes, icicle curtains); this book holds what fills it: an ice arch bridge, a frosted rope bridge and ice floe
-- stepping stones, a frozen waterfall, a frozen mammoth skeleton and its tusks, stalagmites single and clustered, a
-- fallen stalactite, ice crystals, a frozen pool, snowdrifts, an adventurer frozen in ice, an abandoned frosted tent, an
-- ice throne, a frost beast's bone nest, a sled, an ice-fishing hole, treasure frozen into the ice and a cold campfire.
-- One book per tile set, opt-in per source like every book (20261015224350), titled "Grimoire <Area>" with the
-- publisher "Dungeon Grimoire" (20261014100306). `flat` marks what lies on the floor and so casts no shadow of its own.
-- No art here: the library art tool publishes pictures to these rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-glaciers', null, 'Grimoire Glaciers', 'Dungeon Grimoire', '{}',
  'Original top-down ice cave props drawn for Dungeon Grimoire: ice bridges, a frozen waterfall, a mammoth skeleton and stalagmites. Not from any published book.',
  null, null, true, true, 94)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-glaciers', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_glacier_ice_bridge", "name": "Ice arch bridge", "group_key": "crossings", "tags": ["ice", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_rope_bridge", "name": "Frosted rope bridge", "group_key": "crossings", "tags": ["ice", "bridge"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_ice_floes", "name": "Ice floe stepping stones", "group_key": "crossings", "tags": ["ice", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_glacier_frozen_waterfall", "name": "Frozen waterfall", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_glacier_mammoth_skeleton", "name": "Frozen mammoth skeleton", "group_key": "remains", "tags": ["ice", "remains"], "footprint_w": 3, "footprint_h": 2, "flat": true},
  {"id": "dressing_glacier_tusks", "name": "Mammoth tusks", "group_key": "remains", "tags": ["ice", "remains"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_glacier_stalagmite_cluster", "name": "Stalagmite cluster", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_glacier_stalagmite", "name": "Great stalagmite", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_fallen_stalactite", "name": "Fallen stalactite", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_crystals", "name": "Ice crystal formation", "group_key": "arcane", "tags": ["ice", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_frozen_pool", "name": "Frozen pool", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_glacier_snowdrift", "name": "Snowdrift", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_glacier_frozen_adventurer", "name": "Frozen adventurer", "group_key": "remains", "tags": ["ice", "remains"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_tent", "name": "Abandoned frosted tent", "group_key": "camp", "tags": ["ice", "camp"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_glacier_ice_throne", "name": "Ice throne", "group_key": "furniture", "tags": ["ice", "furniture"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_glacier_bone_nest", "name": "Beast's bone nest", "group_key": "vermin", "tags": ["ice", "nest"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_glacier_sled", "name": "Sled", "group_key": "camp", "tags": ["ice", "camp"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_glacier_fishing_hole", "name": "Ice-fishing hole", "group_key": "outdoor", "tags": ["ice", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_glacier_frozen_treasure", "name": "Frozen treasure", "group_key": "loot", "tags": ["ice", "loot"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_glacier_cold_campfire", "name": "Cold campfire", "group_key": "camp", "tags": ["ice", "camp"], "footprint_w": 1, "footprint_h": 1, "flat": true}
]$content$::jsonb)
on conflict (id) do nothing;
