-- Migration: dressing_volcanoes_book
-- The Grimoire Volcanoes Dressing book (#891): the Lava Cavern set's own props, for a lava cave or an efreeti's fortress.
--
-- Lava Cavern draws the cavern and the fortress walls (basalt, lava as the set's liquid, obsidian walls banded in brass,
-- red-hot portcullises); this book holds what furnishes them: crossings over the lava, the efreeti's throne, a throne-room
-- mosaic, a lava forge, a fire altar and summoning circle, silk cushions, a hookah, brass urns, a gong, melted gold, a
-- salamander nest. One book per tile set, opt-in per source like every book (20261015224350), titled "Grimoire <Area>"
-- with the publisher "Dungeon Grimoire" (20261014100306). `flat` marks what lies on the floor and so casts no shadow of
-- its own. No art here: the library art tool publishes pictures to these rows. `on conflict do nothing`, as every
-- library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-volcanoes', null, 'Grimoire Volcanoes', 'Dungeon Grimoire', '{}',
  'Original top-down volcanic and efreeti-fortress props drawn for Dungeon Grimoire: lava crossings, a fire throne, a forge and altar. Not from any published book.',
  null, null, true, true, 91)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-volcanoes', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_volcano_obsidian_bridge", "name": "Obsidian bridge", "group_key": "crossings", "tags": ["volcano", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_chain_bridge", "name": "Chain bridge", "group_key": "crossings", "tags": ["volcano", "bridge"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_brass_grating", "name": "Brass grating walkway", "group_key": "crossings", "tags": ["volcano", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_volcano_stepping_stones", "name": "Basalt stepping stones", "group_key": "crossings", "tags": ["volcano", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_volcano_throne", "name": "Efreeti throne", "group_key": "furniture", "tags": ["volcano", "furniture"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_volcano_mosaic", "name": "Throne-room mosaic", "group_key": "furniture", "tags": ["volcano", "furniture"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_volcano_lava_forge", "name": "Lava forge", "group_key": "workshop", "tags": ["volcano", "craft"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_volcano_summoning_circle", "name": "Fire summoning circle", "group_key": "arcane", "tags": ["volcano", "arcane"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_volcano_fire_altar", "name": "Fire altar", "group_key": "religious", "tags": ["volcano", "religious"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_cushions", "name": "Silk cushions", "group_key": "furniture", "tags": ["volcano", "furniture"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_volcano_hookah", "name": "Brass hookah", "group_key": "furniture", "tags": ["volcano", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_urns", "name": "Brass urns", "group_key": "containers", "tags": ["volcano", "container"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_gong", "name": "Brass gong", "group_key": "religious", "tags": ["volcano", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_magma_cauldron", "name": "Magma cauldron", "group_key": "arcane", "tags": ["volcano", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_melted_gold", "name": "Melted gold", "group_key": "loot", "tags": ["volcano", "loot"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_volcano_salamander_nest", "name": "Salamander nest", "group_key": "vermin", "tags": ["volcano", "nest"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_volcano_hanging_cage", "name": "Iron cage", "group_key": "prison", "tags": ["volcano", "prison"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_volcano_brazier_tripod", "name": "Tripod brazier", "group_key": "religious", "tags": ["volcano", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false}
]$content$::jsonb)
on conflict (id) do nothing;
