-- Migration: dressing_deserts_book
-- The Grimoire Deserts Dressing book (#891): the Sandy Ruins set's own props, for desert ruins and Egyptian-style tombs.
--
-- Sandy Ruins draws the ruins themselves (sand-drowned sandstone floors, painted temple walls, dunes as the impassable
-- mass, oasis water); this book holds what fills them: a temple gateway and a sunken tomb entrance, the sphinx and a
-- colossal pharaoh, statues of jackal, falcon and cat gods, an obelisk, sarcophagi open and closed, canopic jars, shabti
-- figurines, papyrus scrolls and storage jars, bleached skeletons, date palms and papyrus reeds, an abandoned explorer's
-- tent, map table, digging tools, crates of finds and an excavation pit, crossings for the oasis, scorpions, and a sand
-- drift that turns a stretch of paving back into open desert. One book per tile set, opt-in per source like every book
-- (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon Grimoire" (20261014100306). `flat` marks what
-- lies on the floor and so casts no shadow of its own. No art here: the library art tool publishes pictures to these
-- rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-deserts', null, 'Grimoire Deserts', 'Dungeon Grimoire', '{}',
  'Original top-down desert and tomb props drawn for Dungeon Grimoire: temple gateways, sarcophagi, gods of the sands, palms and an explorer''s camp. Not from any published book.',
  null, null, true, true, 93)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-deserts', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_desert_causeway", "name": "Sandstone causeway", "group_key": "crossings", "tags": ["desert", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_stepping_stones", "name": "Stepping stones", "group_key": "crossings", "tags": ["desert", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_desert_reed_raft", "name": "Reed raft", "group_key": "crossings", "tags": ["desert", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_temple_gateway", "name": "Temple gateway", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_tomb_entrance", "name": "Tomb entrance", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_desert_pharaoh_colossus", "name": "Colossal pharaoh", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_desert_sphinx", "name": "Sphinx", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 2, "footprint_h": 3, "flat": false},
  {"id": "dressing_desert_jackal_statue", "name": "Jackal-headed statue", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_falcon_statue", "name": "Falcon-headed statue", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_cat_statue", "name": "Cat goddess statue", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_obelisk", "name": "Obelisk", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_sarcophagus", "name": "Sarcophagus", "group_key": "remains", "tags": ["desert", "remains"], "footprint_w": 1, "footprint_h": 2, "flat": false},
  {"id": "dressing_desert_open_sarcophagus", "name": "Open sarcophagus", "group_key": "remains", "tags": ["desert", "remains"], "footprint_w": 1, "footprint_h": 2, "flat": false},
  {"id": "dressing_desert_canopic_jars", "name": "Canopic jars", "group_key": "containers", "tags": ["desert", "container"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_shabti", "name": "Shabti figurines", "group_key": "religious", "tags": ["desert", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_scrolls", "name": "Papyrus scrolls", "group_key": "arcane", "tags": ["desert", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_storage_jars", "name": "Storage jars", "group_key": "containers", "tags": ["desert", "container"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_skeleton", "name": "Bleached skeleton", "group_key": "remains", "tags": ["desert", "remains"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_desert_camel_skeleton", "name": "Camel skeleton", "group_key": "remains", "tags": ["desert", "remains"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_desert_date_palm", "name": "Date palm", "group_key": "outdoor", "tags": ["desert", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_desert_young_palm", "name": "Young palm", "group_key": "outdoor", "tags": ["desert", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_papyrus", "name": "Papyrus reeds", "group_key": "outdoor", "tags": ["desert", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_explorer_tent", "name": "Abandoned explorer's tent", "group_key": "camp", "tags": ["desert", "camp"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_desert_map_table", "name": "Explorer's map table", "group_key": "camp", "tags": ["desert", "camp"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_dig_tools", "name": "Digging tools", "group_key": "workshop", "tags": ["desert", "dig"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_desert_finds_crates", "name": "Crates of finds", "group_key": "containers", "tags": ["desert", "container"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_desert_excavation", "name": "Excavation pit", "group_key": "workshop", "tags": ["desert", "dig"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_desert_sand_drift", "name": "Sand drift", "group_key": "outdoor", "tags": ["desert", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": true},
  {"id": "dressing_desert_scorpions", "name": "Scorpion nest", "group_key": "vermin", "tags": ["desert", "nest"], "footprint_w": 1, "footprint_h": 1, "flat": true}
]$content$::jsonb)
on conflict (id) do nothing;
