-- Migration: dressing_homes_and_forests_books
-- The Grimoire Homes and Grimoire Forests Dressing books (#891): the Wood Interior and Forest sets' own props.
--
-- Wood Interior draws the house itself (floorboards, timber-framed walls, balustrades, a harbour channel); its book holds
-- the household: hearth, bath, dining set, dresser, cradle, a pier walkway over the water. Forest draws the forest floor,
-- thickets, canopy and streams; its book holds what makes a wood a wood: great trees with crowns up to three cells wide,
-- bushes, ferns, logs, and log and rope bridges and stepping stones across its streams. One book per tile set, opt-in per
-- source like every book (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon Grimoire" (20261014100306).
-- `flat` marks what lies on the floor and so casts no shadow of its own. No art here: the library art tool publishes
-- pictures to these rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values
  ('grimoire-dressing-homes', null, 'Grimoire Homes', 'Dungeon Grimoire', '{}',
   'Original top-down household props drawn for Dungeon Grimoire: hearths, baths, tables, cradles and a pier. Not from any published book.',
   null, null, true, true, 89),
  ('grimoire-dressing-forests', null, 'Grimoire Forests', 'Dungeon Grimoire', '{}',
   'Original top-down forest props drawn for Dungeon Grimoire: trees, bushes, logs and stream crossings. Not from any published book.',
   null, null, true, true, 90)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-homes', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_home_pier_walkway", "name": "Pier walkway", "group_key": "crossings", "tags": ["home", "bridge"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_fireplace", "name": "Fireplace", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_bathtub", "name": "Bathtub", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 2, "flat": false},
  {"id": "dressing_home_drawers", "name": "Chest of drawers", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_dining_set", "name": "Dining table and chairs", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_home_dresser", "name": "Dresser", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_rocking_chair", "name": "Rocking chair", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_cradle", "name": "Cradle", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_washstand", "name": "Washstand", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_coat_rack", "name": "Coat stand", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_harp", "name": "Harp", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_spinning_wheel", "name": "Spinning wheel", "group_key": "workshop", "tags": ["home", "craft"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_butter_churn", "name": "Butter churn", "group_key": "workshop", "tags": ["home", "craft"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_home_potted_herbs", "name": "Potted herbs", "group_key": "furniture", "tags": ["home", "furniture"], "footprint_w": 1, "footprint_h": 1, "flat": false}
]$content$::jsonb)
on conflict (id) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-forests', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_forest_great_oak", "name": "Great oak", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 3, "footprint_h": 3, "flat": false},
  {"id": "dressing_forest_oak", "name": "Oak tree", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_forest_pine", "name": "Pine tree", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_forest_dead_tree", "name": "Dead tree", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_forest_log_bridge", "name": "Log bridge", "group_key": "crossings", "tags": ["forest", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_rope_bridge", "name": "Rope bridge", "group_key": "crossings", "tags": ["forest", "bridge"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_stepping_stones", "name": "Stepping stones", "group_key": "crossings", "tags": ["forest", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_forest_fallen_log", "name": "Fallen log", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_lean_to", "name": "Hunter's lean-to", "group_key": "camp", "tags": ["forest", "camp"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_birch", "name": "Birch tree", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_sapling", "name": "Sapling", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_berry_bush", "name": "Berry bush", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_thorn_bush", "name": "Thorn bush", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_ferns", "name": "Ferns", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_forest_reeds", "name": "Reeds", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_wildflowers", "name": "Wildflowers", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_forest_boulder", "name": "Mossy boulder", "group_key": "outdoor", "tags": ["forest", "nature"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_forest_den", "name": "Animal den", "group_key": "vermin", "tags": ["forest", "den"], "footprint_w": 1, "footprint_h": 1, "flat": true}
]$content$::jsonb)
on conflict (id) do nothing;
