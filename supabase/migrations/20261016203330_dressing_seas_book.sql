-- Migration: dressing_seas_book
-- The Grimoire Seas Dressing book (#891): the Water set's own props, for the open sea, islands, harbours and ships.
--
-- The Water set draws the sea itself: calm open sea as the mass outside every room, a rough swell with whitecaps as its
-- painted water (surf forming where it meets land), sandy island ground as its floor and weathered harbour walls. This
-- book holds what floats on it and stands by it: a pier, a dock platform, a gangplank, a raft, a fishing boat, a ship in
-- three pieces (bow, midship and stern, 4 x 4 cells each; the midship repeats for a longer ship, so bow, midship,
-- midship, stern is a two-masted ship), a shipwreck, a floating mast and a field of flotsam, floating barrels, a kelp
-- bed, a coral reef, a whirlpool, a rocky islet, a palm islet, a sandbar, a patch of shallows, a lighthouse, an anchor,
-- a cargo net and a deck ballista. The lighthouse gives the rules' longest light; the fishing boat and the ship's stern
-- carry lanterns (a lamp's 15 feet bright, 30 more dim). One book per tile set, opt-in per source like every book
-- (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon Grimoire" (20261014100306). `flat` marks what
-- lies on the water and so casts no shadow of its own. No art here: the library art tool publishes pictures to these
-- rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-seas', null, 'Grimoire Seas', 'Dungeon Grimoire', '{}',
  'Original top-down sea and harbour props drawn for Dungeon Grimoire: a ship in pieces, piers, islets, reefs, flotsam and a whirlpool. Not from any published book.',
  null, null, true, true, 97)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat, light)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-seas', flat, light
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_sea_pier", "name": "Wooden pier", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 4, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_sea_dock", "name": "Dock platform", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_sea_gangplank", "name": "Gangplank", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 3, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_sea_raft", "name": "Raft", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_sea_shipwreck", "name": "Shipwreck", "group_key": "remains", "tags": ["sea", "wreck"], "footprint_w": 4, "footprint_h": 4, "flat": false, "light": null},
  {"id": "dressing_sea_broken_mast", "name": "Floating mast", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 4, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_sea_flotsam", "name": "Flotsam field", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 2, "footprint_h": 2, "flat": true, "light": null},
  {"id": "dressing_sea_barrels", "name": "Floating barrels", "group_key": "containers", "tags": ["sea", "cargo"], "footprint_w": 1, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_sea_kelp", "name": "Kelp bed", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 2, "footprint_h": 2, "flat": true, "light": null},
  {"id": "dressing_sea_reef", "name": "Coral reef", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 2, "footprint_h": 2, "flat": true, "light": null},
  {"id": "dressing_sea_whirlpool", "name": "Whirlpool", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 3, "footprint_h": 3, "flat": true, "light": null},
  {"id": "dressing_sea_rocky_islet", "name": "Rocky islet", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_sea_palm_islet", "name": "Palm islet", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 3, "footprint_h": 3, "flat": false, "light": null},
  {"id": "dressing_sea_sandbar", "name": "Sandbar", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 3, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_sea_shallows", "name": "Shallows", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 3, "footprint_h": 3, "flat": true, "light": null},
  {"id": "dressing_sea_lighthouse", "name": "Lighthouse", "group_key": "outdoor", "tags": ["sea", "sea"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": {"color": "#ffc571", "bright": 60, "dim": 60}},
  {"id": "dressing_sea_anchor", "name": "Anchor", "group_key": "loot", "tags": ["sea", "loot"], "footprint_w": 1, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_sea_cargo_net", "name": "Cargo net", "group_key": "containers", "tags": ["sea", "cargo"], "footprint_w": 2, "footprint_h": 2, "flat": true, "light": null},
  {"id": "dressing_sea_ballista", "name": "Deck ballista", "group_key": "workshop", "tags": ["sea", "weapon"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_sea_fishing_boat", "name": "Fishing boat", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 2, "footprint_h": 4, "flat": false, "light": {"color": "#ffc484", "bright": 15, "dim": 30}},
  {"id": "dressing_sea_ship_bow", "name": "Ship: bow", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 4, "footprint_h": 4, "flat": false, "light": null},
  {"id": "dressing_sea_ship_midship", "name": "Ship: midship", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 4, "footprint_h": 4, "flat": false, "light": null},
  {"id": "dressing_sea_ship_stern", "name": "Ship: stern", "group_key": "crossings", "tags": ["sea", "vessel"], "footprint_w": 4, "footprint_h": 4, "flat": false, "light": {"color": "#ffc284", "bright": 15, "dim": 30}}
]$content$::jsonb)
on conflict (id) do nothing;
