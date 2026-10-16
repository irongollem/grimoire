-- Migration: dressing_arcana_book
-- The Grimoire Arcana Dressing book (#891): the Celestial Observatory set's own props, for libraries, observatories and
-- mages' guilds.
--
-- The Celestial Observatory set draws a wizards' tower (blue-grey slate floors, midnight-blue walls banded in brass,
-- quicksilver scrying pools, telescopes, globes and an archmage statue); this book furnishes it in three groups. A
-- library: bookcases single and double-sided, a scroll rack, a library table with chairs, a reading armchair, a
-- lectern, a rolling ladder and piles of books. An observatory: a great telescope on its mount, a 3 x 3 brass
-- planetarium, an astrolabe, a celestial globe, an armillary sphere and a star chart table. A mages' guild: a
-- teleportation circle, an enchanting table, a specimen shelf, a potion rack, a magic mirror and a floating tome; and
-- a brass footbridge and floating stepping discs to cross the quicksilver. Candle-lit pieces give a candle's light,
-- the planetarium's sun a little more, the circle, tome, mirror and enchanting glow dim light only; colours are read
-- from their own art, except the circle's and the mirror's, where that reading caught the brass. One book per tile set,
-- opt-in per source like every book (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon Grimoire"
-- (20261014100306). `flat` marks what lies on the floor and so casts no shadow of its own. No art here: the library art
-- tool publishes pictures to these rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-arcana', null, 'Grimoire Arcana', 'Dungeon Grimoire', '{}',
  'Original top-down library, observatory and mages'' guild props drawn for Dungeon Grimoire: bookcases, telescopes, a planetarium and a teleportation circle. Not from any published book.',
  null, null, true, true, 98)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat, light)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-arcana', flat, light
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_arcana_bookcase", "name": "Bookcase", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_bookcase_double", "name": "Double-sided bookcase", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 3, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_scroll_rack", "name": "Scroll rack", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_library_table", "name": "Library table", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 3, "footprint_h": 2, "flat": false, "light": {"color": "#ffbc71", "bright": 5, "dim": 5}},
  {"id": "dressing_arcana_reading_nook", "name": "Reading armchair", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#ffa666", "bright": 5, "dim": 5}},
  {"id": "dressing_arcana_lectern", "name": "Lectern", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#ffbf71", "bright": 5, "dim": 5}},
  {"id": "dressing_arcana_library_ladder", "name": "Library ladder", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 1, "footprint_h": 2, "flat": true, "light": null},
  {"id": "dressing_arcana_book_piles", "name": "Book piles", "group_key": "furniture", "tags": ["arcane", "library"], "footprint_w": 1, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_arcana_great_telescope", "name": "Great telescope", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_arcana_planetarium", "name": "Planetarium", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 3, "footprint_h": 3, "flat": false, "light": {"color": "#ffb43b", "bright": 10, "dim": 10}},
  {"id": "dressing_arcana_astrolabe", "name": "Astrolabe", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_globe", "name": "Celestial globe", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_armillary", "name": "Armillary sphere", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_star_chart_table", "name": "Star chart table", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": {"color": "#ffbe6b", "bright": 5, "dim": 5}},
  {"id": "dressing_arcana_teleport_circle", "name": "Teleportation circle", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 3, "footprint_h": 3, "flat": true, "light": {"color": "#a8d4ff", "bright": 0, "dim": 15}},
  {"id": "dressing_arcana_enchanting_table", "name": "Enchanting table", "group_key": "workshop", "tags": ["arcane", "enchanting"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": {"color": "#6494ff", "bright": 0, "dim": 10}},
  {"id": "dressing_arcana_specimen_shelf", "name": "Specimen shelf", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_potion_rack", "name": "Potion rack", "group_key": "containers", "tags": ["arcane", "potions"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_magic_mirror", "name": "Magic mirror", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#c9a8ff", "bright": 0, "dim": 5}},
  {"id": "dressing_arcana_floating_tome", "name": "Floating tome", "group_key": "arcane", "tags": ["arcane", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#d8eeff", "bright": 0, "dim": 10}},
  {"id": "dressing_arcana_brass_bridge", "name": "Brass footbridge", "group_key": "crossings", "tags": ["arcane", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_arcana_floating_steps", "name": "Floating stepping discs", "group_key": "crossings", "tags": ["arcane", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true, "light": {"color": "#5eb0ff", "bright": 0, "dim": 5}}
]$content$::jsonb)
on conflict (id) do nothing;
