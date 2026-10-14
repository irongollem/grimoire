-- Dressing's first catalog (#1062): 62 props, into the table 20261014102253
-- created. Ids, names, groups and footprints come from the epic's catalog
-- table (slugs `dressing_<snake_name>`); tags are search words a DM is likely
-- to type for a prop whose name does not contain them ("gold" finds the coin
-- pile). The remains are deliberately not gory.
--
-- No art here: every prop draws the footprint-shaped placeholder until the
-- library art tool publishes its picture (kind `dressing`). One JSON document
-- read by jsonb_populate_recordset, as the Dungeon Craft seed, so the content
-- stays readable; columns not named take their defaults. `on conflict do
-- nothing`, as every library seed: re-running never overwrites a row an admin
-- has since corrected.

insert into public.library_dressing (id, name, group_key, tags, footprint_w, footprint_h)
select id, name, group_key, tags, footprint_w, footprint_h
  from jsonb_populate_recordset(null::public.library_dressing, $content$[
  {"id": "dressing_long_table", "name": "Long table", "group_key": "furniture", "tags": ["feast", "hall", "inn"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_round_table", "name": "Round table", "group_key": "furniture", "tags": ["inn"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_chair", "name": "Chair", "group_key": "furniture", "tags": ["seat"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_bench", "name": "Bench", "group_key": "furniture", "tags": ["seat"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_bed", "name": "Bed", "group_key": "furniture", "tags": ["bedroom", "inn"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_double_bed", "name": "Double bed", "group_key": "furniture", "tags": ["bedroom", "inn"], "footprint_w": 2, "footprint_h": 2},
  {"id": "dressing_straw_pallet", "name": "Straw pallet", "group_key": "furniture", "tags": ["bed", "barracks", "poor"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_cupboard", "name": "Cupboard", "group_key": "furniture", "tags": ["kitchen", "storage"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_wardrobe", "name": "Wardrobe", "group_key": "furniture", "tags": ["bedroom"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_bookshelf", "name": "Bookshelf", "group_key": "furniture", "tags": ["library", "study"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_desk", "name": "Desk", "group_key": "furniture", "tags": ["study", "office"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_throne", "name": "Throne", "group_key": "furniture", "tags": ["king", "court"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_rug", "name": "Rug", "group_key": "furniture", "tags": ["carpet"], "footprint_w": 2, "footprint_h": 3},
  {"id": "dressing_chest", "name": "Chest", "group_key": "containers", "tags": ["treasure", "loot"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_open_chest", "name": "Open chest", "group_key": "containers", "tags": ["treasure", "loot", "looted"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_strongbox", "name": "Strongbox", "group_key": "containers", "tags": ["safe", "treasure"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_crates", "name": "Crates", "group_key": "containers", "tags": ["storage", "cargo"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_barrels", "name": "Barrels", "group_key": "containers", "tags": ["storage", "cellar"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_sacks", "name": "Sacks", "group_key": "containers", "tags": ["storage", "grain"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_urns", "name": "Urns", "group_key": "containers", "tags": ["crypt", "pottery"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_coffin", "name": "Coffin", "group_key": "containers", "tags": ["crypt", "undead"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_sarcophagus", "name": "Sarcophagus", "group_key": "containers", "tags": ["crypt", "tomb", "undead"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_coin_pile", "name": "Coin pile", "group_key": "loot", "tags": ["gold", "treasure", "money"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_treasure_hoard", "name": "Treasure hoard", "group_key": "loot", "tags": ["gold", "treasure", "dragon"], "footprint_w": 2, "footprint_h": 2},
  {"id": "dressing_weapon_pile", "name": "Weapon pile", "group_key": "loot", "tags": ["armoury", "battlefield"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_armour_stand", "name": "Armour stand", "group_key": "loot", "tags": ["armoury", "barracks"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_weapon_rack", "name": "Weapon rack", "group_key": "loot", "tags": ["armoury", "barracks"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_fallen_adventurer", "name": "Fallen adventurer", "group_key": "remains", "tags": ["body", "corpse"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_fallen_robed_figure", "name": "Fallen robed figure", "group_key": "remains", "tags": ["body", "corpse", "cultist"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_skeleton", "name": "Skeleton", "group_key": "remains", "tags": ["body", "undead", "crypt"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_scattered_bones", "name": "Scattered bones", "group_key": "remains", "tags": ["crypt", "lair"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_beast_carcass", "name": "Beast carcass", "group_key": "remains", "tags": ["lair", "hunt"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_bloodstain", "name": "Bloodstain", "group_key": "remains", "tags": ["blood"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_bar_counter", "name": "Bar counter", "group_key": "tavern", "tags": ["inn", "pub"], "footprint_w": 3, "footprint_h": 1},
  {"id": "dressing_keg_rack", "name": "Keg rack", "group_key": "tavern", "tags": ["inn", "ale", "cellar"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_hearth", "name": "Hearth", "group_key": "tavern", "tags": ["fireplace", "fire"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_kitchen_worktable", "name": "Kitchen worktable", "group_key": "tavern", "tags": ["kitchen", "inn"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_cauldron", "name": "Cauldron", "group_key": "tavern", "tags": ["kitchen", "witch", "potion"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_anvil", "name": "Anvil", "group_key": "workshop", "tags": ["smithy"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_forge", "name": "Forge", "group_key": "workshop", "tags": ["smithy", "fire"], "footprint_w": 2, "footprint_h": 2},
  {"id": "dressing_workbench", "name": "Workbench", "group_key": "workshop", "tags": ["smithy", "carpentry"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_loom", "name": "Loom", "group_key": "workshop", "tags": ["weaving"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_alchemy_table", "name": "Alchemy table", "group_key": "arcane", "tags": ["potion", "laboratory"], "footprint_w": 2, "footprint_h": 1},
  {"id": "dressing_summoning_circle", "name": "Summoning circle", "group_key": "arcane", "tags": ["ritual", "cult", "magic"], "footprint_w": 2, "footprint_h": 2},
  {"id": "dressing_scrying_stand", "name": "Scrying stand", "group_key": "arcane", "tags": ["crystal ball", "magic"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_book_pile", "name": "Book pile", "group_key": "arcane", "tags": ["library", "study"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_shrine", "name": "Shrine", "group_key": "religious", "tags": ["altar", "temple"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_pews", "name": "Pews", "group_key": "religious", "tags": ["temple", "chapel"], "footprint_w": 3, "footprint_h": 1},
  {"id": "dressing_candelabra", "name": "Candelabra", "group_key": "religious", "tags": ["candles", "light", "temple"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_bedroll", "name": "Bedroll", "group_key": "camp", "tags": ["camp", "sleep"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_campfire", "name": "Campfire", "group_key": "camp", "tags": ["fire"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_tent", "name": "Tent", "group_key": "camp", "tags": ["camp"], "footprint_w": 2, "footprint_h": 2},
  {"id": "dressing_handcart", "name": "Handcart", "group_key": "camp", "tags": ["cart"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_wagon", "name": "Wagon", "group_key": "camp", "tags": ["cart", "caravan", "road"], "footprint_w": 2, "footprint_h": 3},
  {"id": "dressing_rowboat", "name": "Rowboat", "group_key": "camp", "tags": ["boat", "dock", "river"], "footprint_w": 1, "footprint_h": 2},
  {"id": "dressing_cage", "name": "Cage", "group_key": "prison", "tags": ["jail", "cell"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_stocks", "name": "Stocks", "group_key": "prison", "tags": ["jail", "punishment"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_chains", "name": "Chains", "group_key": "prison", "tags": ["jail", "shackles", "manacles"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_well", "name": "Well", "group_key": "outdoor", "tags": ["water", "village"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_tree_stump", "name": "Tree stump", "group_key": "outdoor", "tags": ["forest"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_hay_bales", "name": "Hay bales", "group_key": "outdoor", "tags": ["farm", "stable"], "footprint_w": 1, "footprint_h": 1},
  {"id": "dressing_signpost", "name": "Signpost", "group_key": "outdoor", "tags": ["road", "crossroads"], "footprint_w": 1, "footprint_h": 1}
]$content$::jsonb)
on conflict (id) do nothing;
