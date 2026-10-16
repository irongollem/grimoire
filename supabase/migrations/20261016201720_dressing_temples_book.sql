-- Migration: dressing_temples_book
-- The Grimoire Temples Dressing book (#891): the Black Rock set's own props, for the black-stone temple of a fiendish cult.
--
-- Black Rock draws the temple itself (basalt halls carved with sigils and horned skulls, spiked iron doors, pools of
-- ichor, green ritual fire on the walls); this book holds what fills it: a bone bridge, a black slab bridge and stepping
-- stones over the ichor, a great ritual circle of green fire (invented sigils, never a real-world symbol), a sacrificial
-- altar, a fiend idol, a bone throne, a grimoire on its lectern, a scrying pool, a hellfire brazier and black candles, a
-- sigil obelisk, a fiend's-maw gate, skull and bone heaps, a gibbet cage, a chained slab, cultists' bedrolls and offering
-- bowls. Its fire and glowing pieces carry light in the rules' terms (dressing_lights): the brazier as a torch, candles
-- as candles, the circle between, the pool and obelisk dim only; each colour read from its own art. One book per tile
-- set, opt-in per source like every book (20261015224350), titled "Grimoire <Area>" with the publisher "Dungeon
-- Grimoire" (20261014100306). `flat` marks what lies on the floor and so casts no shadow of its own. No art here: the
-- library art tool publishes pictures to these rows. `on conflict do nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-temples', null, 'Grimoire Temples', 'Dungeon Grimoire', '{}',
  'Original top-down cult temple props drawn for Dungeon Grimoire: ritual circles, fiend idols, bone thrones and sacrificial altars. Not from any published book.',
  null, null, true, true, 96)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat, light)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-temples', flat, light
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_temple_bone_bridge", "name": "Bone bridge", "group_key": "crossings", "tags": ["temple", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_temple_slab_bridge", "name": "Black slab bridge", "group_key": "crossings", "tags": ["temple", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_temple_stepping_stones", "name": "Stepping stones", "group_key": "crossings", "tags": ["temple", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_temple_ritual_circle", "name": "Ritual circle", "group_key": "arcane", "tags": ["temple", "ritual"], "footprint_w": 3, "footprint_h": 3, "flat": true, "light": {"color": "#e9ff76", "bright": 10, "dim": 10}},
  {"id": "dressing_temple_sacrificial_altar", "name": "Sacrificial altar", "group_key": "religious", "tags": ["temple", "shrine"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_temple_fiend_idol", "name": "Fiend idol", "group_key": "religious", "tags": ["temple", "shrine"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_temple_bone_throne", "name": "Bone throne", "group_key": "furniture", "tags": ["temple", "furniture"], "footprint_w": 2, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_temple_lectern", "name": "Grimoire lectern", "group_key": "arcane", "tags": ["temple", "ritual"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#ffd593", "bright": 5, "dim": 5}},
  {"id": "dressing_temple_scrying_pool", "name": "Scrying pool", "group_key": "arcane", "tags": ["temple", "ritual"], "footprint_w": 2, "footprint_h": 2, "flat": true, "light": {"color": "#d8ffa1", "bright": 0, "dim": 10}},
  {"id": "dressing_temple_green_brazier", "name": "Hellfire brazier", "group_key": "religious", "tags": ["temple", "shrine"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#d7ff51", "bright": 20, "dim": 20}},
  {"id": "dressing_temple_black_candles", "name": "Black candles", "group_key": "religious", "tags": ["temple", "shrine"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#e2ff62", "bright": 5, "dim": 10}},
  {"id": "dressing_temple_skull_pile", "name": "Skull pile", "group_key": "remains", "tags": ["temple", "bones"], "footprint_w": 1, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_temple_cage", "name": "Hanging cage", "group_key": "prison", "tags": ["temple", "prison"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_temple_chained_slab", "name": "Chained slab", "group_key": "prison", "tags": ["temple", "prison"], "footprint_w": 1, "footprint_h": 2, "flat": false, "light": null},
  {"id": "dressing_temple_cult_robes", "name": "Cultist bedrolls", "group_key": "camp", "tags": ["temple", "camp"], "footprint_w": 2, "footprint_h": 1, "flat": true, "light": null},
  {"id": "dressing_temple_offering_bowls", "name": "Offering bowls", "group_key": "religious", "tags": ["temple", "shrine"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_temple_sigil_obelisk", "name": "Sigil obelisk", "group_key": "arcane", "tags": ["temple", "ritual"], "footprint_w": 1, "footprint_h": 1, "flat": false, "light": {"color": "#e0ffac", "bright": 0, "dim": 10}},
  {"id": "dressing_temple_demon_maw", "name": "Fiend's maw gate", "group_key": "religious", "tags": ["temple", "shrine"], "footprint_w": 2, "footprint_h": 1, "flat": false, "light": null},
  {"id": "dressing_temple_bone_heap", "name": "Bone heap", "group_key": "remains", "tags": ["temple", "bones"], "footprint_w": 2, "footprint_h": 2, "flat": true, "light": null}
]$content$::jsonb)
on conflict (id) do nothing;
