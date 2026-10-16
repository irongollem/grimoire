-- Migration: dressing_dungeons_book
-- The Grimoire Dungeons Dressing book (#891): the Stone Dungeon set's own props, the second set book after the Sewers.
--
-- The Stone Dungeon tile set draws the dungeon itself (flagstones, walls, barred cells, a flooded channel, torch sconces);
-- this book holds what a DM places in it: crossings over a channel, a prison's furnishings and leavings, the guards' table,
-- spiders' corners. Opt-in per source like every book (20261015224350 settled one book per tile set), titled
-- "Grimoire <Area>" with the publisher "Dungeon Grimoire" (20261014100306). `flat` marks what lies on the floor and so
-- casts no shadow of its own. No art here: the library art tool publishes pictures to these rows. `on conflict do
-- nothing`, as every library seed.

insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-dungeons', null, 'Grimoire Dungeons', 'Dungeon Grimoire', '{}',
  'Original top-down dungeon props drawn for Dungeon Grimoire: crossings, a prison''s furnishings and the leavings of the deep. Not from any published book.',
  null, null, true, true, 88)
on conflict (key) do nothing;

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h, source, flat)
select id, name, group_key, tags, footprint_w, footprint_h, 'grimoire-dressing-dungeons', flat
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_dungeon_slab_bridge", "name": "Stone slab bridge", "group_key": "crossings", "tags": ["dungeon", "bridge"], "footprint_w": 3, "footprint_h": 1, "flat": false},
  {"id": "dressing_dungeon_drawbridge", "name": "Lowered drawbridge", "group_key": "crossings", "tags": ["dungeon", "bridge"], "footprint_w": 2, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_ledge_walkway", "name": "Stone ledge walkway", "group_key": "crossings", "tags": ["dungeon", "bridge"], "footprint_w": 4, "footprint_h": 1, "flat": false},
  {"id": "dressing_dungeon_torture_rack", "name": "Torture rack", "group_key": "prison", "tags": ["dungeon", "prison"], "footprint_w": 1, "footprint_h": 2, "flat": false},
  {"id": "dressing_dungeon_tool_table", "name": "Torturer's table", "group_key": "prison", "tags": ["dungeon", "prison"], "footprint_w": 2, "footprint_h": 1, "flat": false},
  {"id": "dressing_dungeon_iron_maiden", "name": "Iron maiden", "group_key": "prison", "tags": ["dungeon", "prison"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_dungeon_floor_shackles", "name": "Floor shackles", "group_key": "prison", "tags": ["dungeon", "prison"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_prisoner_straw", "name": "Prisoner's straw and bucket", "group_key": "prison", "tags": ["dungeon", "prison"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_keys_manacles", "name": "Keys and manacles", "group_key": "prison", "tags": ["dungeon", "prison"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_dice_table", "name": "Guard's dice table", "group_key": "furniture", "tags": ["dungeon", "guard"], "footprint_w": 1, "footprint_h": 1, "flat": false},
  {"id": "dressing_dungeon_skull_heap", "name": "Heap of skulls", "group_key": "remains", "tags": ["dungeon", "bones"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_cobwebs", "name": "Cobwebs", "group_key": "vermin", "tags": ["dungeon", "spiders"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_egg_sacs", "name": "Spider egg sacs", "group_key": "vermin", "tags": ["dungeon", "spiders"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_floor_drain", "name": "Floor drain", "group_key": "outdoor", "tags": ["dungeon", "floor"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_trapdoor", "name": "Trapdoor", "group_key": "outdoor", "tags": ["dungeon", "floor"], "footprint_w": 1, "footprint_h": 1, "flat": true},
  {"id": "dressing_dungeon_floor_candles", "name": "Floor candles", "group_key": "religious", "tags": ["dungeon", "candles"], "footprint_w": 1, "footprint_h": 1, "flat": true}
]$content$::jsonb)
on conflict (id) do nothing;
