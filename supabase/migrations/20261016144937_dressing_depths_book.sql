-- Migration: dressing_depths_book
-- The Grimoire Depths Dressing book (#891): the Underdark set's own props, for deep caves lit only by bioluminescence.
--
-- Underdark draws the cave itself (dark wet rock with small glowing patches, ragged walls rimmed with glowing moss, a
-- black underground lake); this book holds what fills it: a chasm, a crevasse and a sinkhole, a rope bridge, a natural
-- stone arch and stepping stones to cross them, giant teal and violet mushrooms, mushroom clusters, a fungus garden,
-- glowing moss, a glowing pool, crystal and stalagmite clusters, a giant web with cocoons and egg sacs, a spider shrine,
-- a fungus folk ring, a giant beetle's shell, an explorer's remains and an abandoned mine cart. One book per tile set,
-- opt-in per source like every book (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon Grimoire"
-- (20261014100306). `flat` marks what lies on the floor and so casts no shadow of its own. No art here: the library art
-- tool publishes pictures to these rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-depths', null, 'Grimoire Depths', 'Dungeon Grimoire', '{}',
  'Original top-down deep cave props drawn for Dungeon Grimoire: chasms, glowing fungi, crystals and spider lairs. Not from any published book.',
  null, null, true, true, 95)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-depths', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_depths_chasm", "name": "Chasm", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 3, "footprint_h": 3, "flat": true},
  {"id": "dressing_depths_crevasse", "name": "Crevasse", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 3, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_sinkhole", "name": "Sinkhole", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_depths_rope_bridge", "name": "Rope bridge", "group_key": "crossings", "tags": ["underground", "bridge"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_depths_stone_arch", "name": "Natural stone arch", "group_key": "crossings", "tags": ["underground", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_depths_stepping_stones", "name": "Stepping stones", "group_key": "crossings", "tags": ["underground", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_teal_mushroom", "name": "Giant teal mushroom", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_depths_violet_mushroom", "name": "Giant violet mushroom", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_depths_mushroom_cluster", "name": "Mushroom cluster", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_depths_fungus_garden", "name": "Fungus garden", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_depths_glowing_moss", "name": "Glowing moss", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_glowing_pool", "name": "Glowing pool", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_depths_crystals", "name": "Crystal cluster", "group_key": "arcane", "tags": ["underground", "crystal"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_depths_stalagmites", "name": "Stalagmite cluster", "group_key": "outdoor", "tags": ["underground", "cave"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_depths_web", "name": "Giant spider web", "group_key": "vermin", "tags": ["underground", "spiders"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_depths_cocoons", "name": "Silk cocoons", "group_key": "vermin", "tags": ["underground", "spiders"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_egg_sacs", "name": "Spider egg sacs", "group_key": "vermin", "tags": ["underground", "spiders"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_spider_shrine", "name": "Spider shrine", "group_key": "religious", "tags": ["underground", "shrine"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_depths_fungus_ring", "name": "Fungus folk ring", "group_key": "religious", "tags": ["underground", "shrine"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_depths_beetle_carcass", "name": "Giant beetle carcass", "group_key": "remains", "tags": ["underground", "remains"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_skeleton", "name": "Explorer's remains", "group_key": "remains", "tags": ["underground", "remains"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_depths_mine_cart", "name": "Abandoned mine cart", "group_key": "workshop", "tags": ["underground", "mine"], "footprint_w": 1, "footprint_h": 1, "flat": false}
]$content$::jsonb)
on conflict (id) do nothing;
