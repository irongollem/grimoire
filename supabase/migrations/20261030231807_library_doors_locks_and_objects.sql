-- The ordinary things a party opens, picks, forces or smashes, as library
-- dungeon features with their object stats (20261030214202 gave features the
-- columns). Until now the Dungeon Craft library held only concealments: a DM
-- who wanted a plain locked door or a cart to hide behind had to write one.
--
-- AC and hit points follow the Dungeon Master's Guide object rules (both
-- editions): AC by material, hit points by size, fragile or resilient
-- (`src/rules/objects.ts`). supabase/tests/dungeon_craft_library.test.sql holds
-- every library row to that table. The break and lock DCs are an app
-- convention on the DMG's typical-DC ladder (10 easy, 15 medium, 20 hard,
-- 25 very hard), since the book gives no per-door numbers.
--
-- No art here: each row has a brief in the library art queue and shows the
-- placeholder until its picture is published. `on conflict do nothing`, as
-- every library seed.

insert into public.library_dungeon_features (id, name, feature_type, description, perception_dc, investigation_dc, arcana_dc, trigger_type, trigger_description, contents_description, feature_glyph, tags, notes, object_material, object_size, object_ac, object_hp, damage_threshold, break_dc, lock_dc)
select id, name, feature_type, description, perception_dc, investigation_dc, arcana_dc, trigger_type, trigger_description, contents_description, feature_glyph, tags, notes, object_material, object_size, object_ac, object_hp, damage_threshold, break_dc, lock_dc
  from jsonb_populate_recordset(null::public.library_dungeon_features, $content$[
 {
  "id": "grimoire_wooden_door",
  "name": "Wooden Door",
  "feature_type": "Door",
  "description": "A plain plank door on iron hinges with a simple lock, the kind found on every storeroom and guardroom.",
  "trigger_type": "Key",
  "trigger_description": "A simple iron lock. The key hangs on the belt of whoever keeps the room.",
  "tags": ["door", "wood", "standard"],
  "notes": "Unlocked, it simply opens: ignore the lock. Swollen with damp, it sticks, and the same Strength check shoulders it open. A failed attempt to force it is loud enough to be heard in the next room.",
  "object_material": "wood", "object_size": "medium", "object_ac": 15, "object_hp": 18,
  "break_dc": 15, "lock_dc": 15
 },
 {
  "id": "grimoire_iron_bound_door",
  "name": "Iron-Bound Door",
  "feature_type": "Door",
  "description": "Thick oak planks crossed with iron straps and studded with nail heads, hung in a stone frame.",
  "trigger_type": "Key",
  "trigger_description": "A solid lock behind an iron plate. The key is kept by the captain of the guard or hidden nearby.",
  "tags": ["door", "wood", "iron", "sturdy"],
  "notes": "The straps give it a damage threshold: a blow that deals less than 5 damage does nothing. With the hinge pins on this side, a character with tools can take it off its hinges in 1 minute instead.",
  "object_material": "wood", "object_size": "medium", "object_ac": 15, "object_hp": 18,
  "damage_threshold": 5, "break_dc": 20, "lock_dc": 15
 },
 {
  "id": "grimoire_iron_door",
  "name": "Iron Door",
  "feature_type": "Door",
  "description": "A door of riveted iron plate set in a stone frame, cold to the touch, with a heavy lock plate at waist height.",
  "trigger_type": "Key",
  "trigger_description": "A good lock. The key, a knock spell, or a long time with thieves' tools.",
  "tags": ["door", "iron", "vault", "prison"],
  "notes": "Rusted hinges shriek whenever it moves, quietly or not. Breaking it down is a job for a siege, not a shoulder.",
  "object_material": "iron", "object_size": "medium", "object_ac": 19, "object_hp": 18,
  "damage_threshold": 10, "break_dc": 25, "lock_dc": 20
 },
 {
  "id": "grimoire_stone_door",
  "name": "Stone Door",
  "feature_type": "Door",
  "description": "A slab of dressed stone set on a central pivot. It turns with a long push, grinding on its sill.",
  "trigger_type": "None",
  "tags": ["door", "stone", "heavy"],
  "notes": "Not locked, just heavy: the Strength check swings it open, and a second character can help. Wedged shut from the other side, it can only be broken.",
  "object_material": "stone", "object_size": "medium", "object_ac": 17, "object_hp": 18,
  "damage_threshold": 10, "break_dc": 20
 },
 {
  "id": "grimoire_barred_door",
  "name": "Barred Door",
  "feature_type": "Door",
  "description": "A stout plank door barred from the far side with a beam across two iron brackets. There is no keyhole on this side.",
  "trigger_type": "Other",
  "trigger_description": "Lifting the bar from the far side opens it. From this side there is nothing to pick.",
  "tags": ["door", "wood", "barred"],
  "notes": "A thin blade slid through the gap can lift the bar with a DC 15 Dexterity (Sleight of Hand) check, and so can a mage hand cast by someone who can see the bar.",
  "object_material": "wood", "object_size": "medium", "object_ac": 15, "object_hp": 18,
  "break_dc": 20
 },
 {
  "id": "grimoire_portcullis",
  "name": "Portcullis",
  "feature_type": "Door",
  "description": "A grille of iron bars dropped into grooves across the passage, its winch in a chamber above or beside it.",
  "trigger_type": "Lever",
  "trigger_description": "A winch or lever in the gatehouse raises and lowers it.",
  "tags": ["door", "iron", "gate", "castle"],
  "notes": "The break DC is the Strength check to lift it by hand; it drops again when let go unless something is wedged under it. Bending two bars far enough for a Small creature to squeeze through is the same check. Its numbers are for one 10-foot section; a wider gate has one section per 10 feet.",
  "object_material": "iron", "object_size": "large", "object_ac": 19, "object_hp": 27,
  "damage_threshold": 10, "break_dc": 25
 },
 {
  "id": "grimoire_padlock",
  "name": "Padlock",
  "feature_type": "Lock",
  "description": "A heavy iron padlock through a hasp, as found on a chest, a gate or a cellar hatch.",
  "trigger_type": "Key",
  "trigger_description": "Its key, or thieves' tools.",
  "tags": ["lock", "iron", "standard"],
  "notes": "Its numbers are the lock's own, not the door's or chest's it hangs on. Smashing it off is quicker than picking it and far louder: every blow rings through the nearby rooms.",
  "object_material": "iron", "object_size": "tiny", "object_ac": 19, "object_hp": 5,
  "break_dc": 20, "lock_dc": 15
 },
 {
  "id": "grimoire_fine_lock",
  "name": "Fine Lock",
  "feature_type": "Lock",
  "description": "A lock of fitted brass and steel set into a door or a strongbox, its keyhole shielded by a sliding plate.",
  "trigger_type": "Key",
  "trigger_description": "Its key, or a patient hand with thieves' tools.",
  "tags": ["lock", "iron", "quality"],
  "notes": "Made by a locksmith who expected thieves. Failing to pick it by 5 or more snaps a pick in the keyhole, and later attempts have disadvantage until the broken piece is fished out (1 minute).",
  "object_material": "iron", "object_size": "tiny", "object_ac": 19, "object_hp": 5,
  "damage_threshold": 5, "break_dc": 25, "lock_dc": 20
 },
 {
  "id": "grimoire_iron_strongbox",
  "name": "Iron Strongbox",
  "feature_type": "Treasure Chest",
  "description": "A squat iron box riveted at the corners and bolted to the floor through holes in its base.",
  "trigger_type": "Key",
  "trigger_description": "A good lock. The owner wears the key, or keeps it somewhere they think is clever.",
  "contents_description": "A merchant's or a quartermaster's valuables: coin, a ledger, a few letters of credit.",
  "tags": ["chest", "iron", "loot"],
  "notes": "Bolted down, it cannot be carried off until its four bolts are cut, each a Tiny iron object (AC 19, 5 hit points).",
  "object_material": "iron", "object_size": "small", "object_ac": 19, "object_hp": 10,
  "damage_threshold": 5, "break_dc": 20, "lock_dc": 20
 },
 {
  "id": "grimoire_cart",
  "name": "Cart",
  "feature_type": "Object",
  "description": "A two-wheeled wooden cart with a long handle, the kind pulled by a mule or a pair of labourers.",
  "trigger_type": "None",
  "contents_description": "Whatever it was carrying: ore, sacks of grain, a few barrels, or a tarp over something better left covered.",
  "tags": ["object", "wood", "cover", "vehicle"],
  "notes": "A creature behind it has half cover, or three-quarters cover crouched behind its bed. Each wheel is a Medium section of its own (AC 15, 18 hit points): break one and the cart goes nowhere. Tipping it over takes a DC 15 Strength check.",
  "object_material": "wood", "object_size": "large", "object_ac": 15, "object_hp": 27
 },
 {
  "id": "grimoire_barrel",
  "name": "Barrel",
  "feature_type": "Object",
  "description": "A banded wooden barrel standing on end, its lid nailed down.",
  "trigger_type": "None",
  "contents_description": "Ale, water, salt fish, lamp oil, or something hidden under a layer of apples.",
  "tags": ["object", "wood", "container"],
  "notes": "The break DC is staving in the lid. A broken barrel of lamp oil spreads over a 10-foot square and burns like a flask of oil if lit.",
  "object_material": "wood", "object_size": "medium", "object_ac": 15, "object_hp": 18,
  "break_dc": 10
 },
 {
  "id": "grimoire_crate",
  "name": "Crate",
  "feature_type": "Object",
  "description": "A nailed crate of thin boards, stencilled with a merchant's mark.",
  "trigger_type": "None",
  "contents_description": "Packed in straw: tools, crockery, candles, or a crate of crossbow bolts.",
  "tags": ["object", "wood", "container"],
  "notes": "Fragile by the book: one solid blow splits it. A crowbar gives advantage on the check to pry the lid off quietly.",
  "object_material": "wood", "object_size": "medium", "object_ac": 15, "object_hp": 4,
  "break_dc": 10
 },
 {
  "id": "grimoire_chandelier",
  "name": "Chandelier",
  "feature_type": "Object",
  "description": "A wheel of black iron hung on a chain over the hall, crowded with candles.",
  "trigger_type": "Other",
  "trigger_description": "Its chain runs to a cleat on the wall. Cut or unhooked, the chandelier drops.",
  "tags": ["object", "iron", "hall", "hazard"],
  "notes": "The chain is a Tiny iron object (AC 19, 5 hit points). A creature beneath it when it falls makes a DC 13 Dexterity saving throw, taking 2d6 bludgeoning damage on a failure or half as much on a success. Swinging from it takes a DC 12 Strength (Athletics) check.",
  "object_material": "iron", "object_size": "medium", "object_ac": 19, "object_hp": 18
 }
]$content$::jsonb)
on conflict (id) do nothing;

-- The library's three plain chests are objects too. Each is updated only while
-- every object field is still empty, so an admin's own numbers are kept.
update public.library_dungeon_features as f
   set object_material = v.material, object_size = v.size, object_ac = v.ac, object_hp = v.hp,
       break_dc = v.break_dc, lock_dc = v.lock_dc
  from (values
    -- "Standard iron lock (DC 15 Thieves' Tools to pick)", per its own trigger text.
    ('grimoire_iron_banded_chest',  'wood', 'small', 15, 10, 15::smallint, 15::smallint),
    -- Unlocked: nothing to pick or force.
    ('grimoire_false_bottom_chest', 'wood', 'small', 15, 10, null, null),
    -- Its keyhole is a decoy and its rings are the lock, so no lock DC.
    ('grimoire_trick_lock_coffer',  'wood', 'tiny',  15, 5,  15::smallint, null)
  ) as v(id, material, size, ac, hp, break_dc, lock_dc)
 where f.id = v.id
   and f.object_material is null and f.object_size is null and f.object_ac is null and f.object_hp is null
   and f.damage_threshold is null and f.break_dc is null and f.lock_dc is null;
