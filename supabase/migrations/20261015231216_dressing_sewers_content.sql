-- Migration: dressing_sewers_content
-- The Grimoire Sewers Dressing book's props (#1065): crossings for the canals and the leavings of a rat warren.
--
-- The Sewer/Swamp tile set draws the sewer itself (walkways, canal water, curbs, grates, sluices, walls); this book holds
-- what a DM places on top of it, several cells long where a crossing must span a canal. It is opt-in like every book
-- (20261015224350 created the source). `flat` marks what lies on the floor and so casts no shadow of its own.
-- No art here: the pictures are published to these rows by the library art tool (kind `dressing`, 256 px per cell), and
-- a prop draws a footprint placeholder until then. `on conflict do nothing`, as every library seed.

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-sewers', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_sewer_plank_bridge", "name": "Plank bridge", "group_key": "crossings", "tags": ["sewer", "bridge", "canal"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_sewer_arch_bridge", "name": "Stone arch bridge", "group_key": "crossings", "tags": ["sewer", "bridge", "canal"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_sewer_grating", "name": "Iron grating walkway", "group_key": "crossings", "tags": ["sewer", "walkway", "canal"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_plank_walkway", "name": "Plank walkway", "group_key": "crossings", "tags": ["sewer", "walkway", "canal"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_sewer_rat_nest", "name": "Rat nest", "group_key": "vermin", "tags": ["sewer", "rats", "warren"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_small_rat_nest", "name": "Small rat nest", "group_key": "vermin", "tags": ["sewer", "rats", "warren"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_burrow", "name": "Burrow hole", "group_key": "vermin", "tags": ["sewer", "rats", "warren"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_crawl_tunnel", "name": "Collapsed crawl tunnel", "group_key": "vermin", "tags": ["sewer", "rats", "warren", "tunnel"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_sewer_gnawed_bones", "name": "Gnawed bones", "group_key": "vermin", "tags": ["sewer", "rats", "bones"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_food_stash", "name": "Stolen food stash", "group_key": "vermin", "tags": ["sewer", "rats", "food"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_dead_rats", "name": "Dead rats", "group_key": "vermin", "tags": ["sewer", "rats"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_refuse_heap", "name": "Refuse heap with rats", "group_key": "vermin", "tags": ["sewer", "rats", "refuse"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_fungus", "name": "Sewer fungus", "group_key": "outdoor", "tags": ["sewer", "fungus"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_sludge", "name": "Sludge puddle", "group_key": "outdoor", "tags": ["sewer", "sludge"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_debris_raft", "name": "Floating debris", "group_key": "outdoor", "tags": ["sewer", "canal", "water"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_rotten_crate", "name": "Rotten crate", "group_key": "containers", "tags": ["sewer", "crate"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_sewer_grapple", "name": "Rope and grappling hook", "group_key": "loot", "tags": ["sewer", "rope"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_pipe_section", "name": "Rusted pipe section", "group_key": "workshop", "tags": ["sewer", "pipe"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_lantern", "name": "Hooded lantern", "group_key": "camp", "tags": ["sewer", "light"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_sewer_skeleton", "name": "Slumped skeleton", "group_key": "remains", "tags": ["sewer", "bones"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_manhole", "name": "Manhole cover", "group_key": "outdoor", "tags": ["sewer", "manhole"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_sewer_drain", "name": "Drain grate", "group_key": "outdoor", "tags": ["sewer", "drain"], "footprint_w": 1, "footprint_h": 1, "flat": true}
]$content$::jsonb)
on conflict (id) do nothing;
