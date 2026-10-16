-- Migration: dressing_palaces_book
-- The Grimoire Palaces Dressing book (#891): the Marble Palace set's own props, for a royal palace or a temple of the gods.
--
-- Marble Palace draws the halls themselves (cream marble floors, dark veined walls with gilded meanders, golden doors,
-- Greek columns, sacred pools, sun, moon and star wall reliefs); this book holds what furnishes them: a royal feast, a
-- golden chariot, a throne and banquet couches, a carpet runner, a marble bridge and stepping stones over the pools, and
-- the divine symbols as three matching families, so a DM can mix them or build a temple to one: for each of the sun, the
-- moon and the stars an altar, a statue, a colossal statue, a medallion inlay and a great floor mosaic. One book per tile
-- set, opt-in per source like every book (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon Grimoire"
-- (20261014100306). `flat` marks what lies on the floor and so casts no shadow of its own. No art here: the library art
-- tool publishes pictures to these rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-palaces', null, 'Grimoire Palaces', 'Dungeon Grimoire', '{}',
  'Original top-down palace and temple props drawn for Dungeon Grimoire: a royal feast, a golden chariot, thrones, and altars, statues and mosaics of the sun, moon and stars. Not from any published book.',
  null, null, true, true, 92)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-palaces', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_palace_marble_bridge", "name": "Marble bridge", "group_key": "crossings", "tags": ["palace", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_stepping_stones", "name": "Marble stepping stones", "group_key": "crossings", "tags": ["palace", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_palace_feast_table", "name": "Feast table", "group_key": "furniture", "tags": ["palace", "furniture"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_chariot", "name": "Golden chariot", "group_key": "camp", "tags": ["palace", "travel"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_palace_throne", "name": "Royal throne", "group_key": "furniture", "tags": ["palace", "furniture"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_palace_couch", "name": "Banquet couch", "group_key": "furniture", "tags": ["palace", "furniture"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_carpet", "name": "Royal carpet runner", "group_key": "furniture", "tags": ["palace", "furniture"], "footprint_w": 4, "footprint_h": 1, "flat": true},
  {"id": "dressing_palace_sun_altar", "name": "Sun altar", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_moon_altar", "name": "Moon altar", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_star_altar", "name": "Star altar", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_sun_statue", "name": "Sun god statue", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_moon_statue", "name": "Moon goddess statue", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_star_statue", "name": "Star king statue", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_sun_colossus", "name": "Colossal sun god", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_palace_moon_colossus", "name": "Colossal moon goddess", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_palace_star_colossus", "name": "Colossal star king", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 2, "footprint_h": 2, "flat": false},
  {"id": "dressing_palace_sun_medallion", "name": "Sun medallion inlay", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_palace_moon_medallion", "name": "Moon medallion inlay", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_palace_star_medallion", "name": "Star medallion inlay", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_palace_sun_mosaic", "name": "Great sun mosaic", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 3, "footprint_h": 3, "flat": true},
  {"id": "dressing_palace_moon_mosaic", "name": "Great moon mosaic", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 3, "footprint_h": 3, "flat": true},
  {"id": "dressing_palace_star_mosaic", "name": "Great star mosaic", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 3, "footprint_h": 3, "flat": true},
  {"id": "dressing_palace_orrery", "name": "Golden orrery", "group_key": "arcane", "tags": ["palace", "arcane"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_tripod", "name": "Golden tripod brazier", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_offerings", "name": "Offering bowls", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_palace_flame_urn", "name": "Sacred flame urn", "group_key": "religious", "tags": ["palace", "religious"], "footprint_w": 1, "footprint_h": 1, "flat": false}
]$content$::jsonb)
on conflict (id) do nothing;
