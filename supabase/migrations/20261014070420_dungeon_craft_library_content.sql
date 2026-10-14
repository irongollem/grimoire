-- The Dungeon Craft library's first entries (#1060), into the tables
-- 20261014070034 created.
--
-- Lifted: every template "Populate Examples" used to copy (14 traps, 17
-- features, 3 puzzles, from src/data/*Templates.ts, retired with this epic),
-- plus two generic traps from the maintainer's own prep (Iron Gate Spikes and
-- Crumbling Column Gauntlet, rewritten to drop into any dungeon). The Waterway
-- Vault's pouring solution is corrected: the template's steps ended on 7 pints,
-- not 8. New: 14 traps, 13 features and 9 puzzles written for the library, and
-- two roll tables (roll tables are personal, so only two examples).
--
-- No art here: the lifted entries' pictures are moved under srd/ by the data
-- pass, and new entries render the placeholder until the library art tool
-- paints them. Each table is one JSON document read by jsonb_populate_recordset,
-- so the content stays readable and needs no per-value SQL escaping; columns
-- not named take their defaults. `on conflict do nothing`, as every library
-- seed: re-running never overwrites a row an admin has since corrected.

-- ── library_traps (30) ───────────────────────────────────────────────
insert into public.library_traps (id, name, description, trap_type, cr, trigger_type, detection_dc, disarm_dc, effect_description, save_type, save_dc, attack_bonus, reset_type, trap_hp, trap_ac, damage_immunities, damage_entries, hazard_glyph, tags, notes)
select id, name, description, trap_type, cr, trigger_type, detection_dc, disarm_dc, effect_description, save_type, save_dc, attack_bonus, reset_type, trap_hp, trap_ac, damage_immunities, damage_entries, hazard_glyph, tags, notes
  from jsonb_populate_recordset(null::public.library_traps, $content$[
 {
  "id": "grimoire_hidden_pit",
  "name": "Hidden Pit",
  "description": "The floor looks like the rest of the passage, but a hinged slab of stone sits flush with the flagstones, held level by a sprung catch.",
  "trap_type": "Mechanical",
  "cr": "1/4",
  "trigger_type": "Pressure Plate",
  "detection_dc": 15,
  "disarm_dc": 10,
  "effect_description": "A 10-foot-deep pit opens beneath the triggering creature. The pit cover is hinged and springs back into place after the creature falls through.",
  "save_type": "DEX",
  "save_dc": 15,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d6",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": "pit",
  "tags": [
   "pit",
   "classic",
   "dungeon"
  ],
  "notes": "A creature that succeeds on its save catches the edge of the pit and can climb out as part of its movement."
 },
 {
  "id": "grimoire_spiked_pit",
  "name": "Spiked Pit",
  "description": "A shallow scuff in the dust hints that the floor here has been opened and closed many times.",
  "trap_type": "Mechanical",
  "cr": "1/2",
  "trigger_type": "Pressure Plate",
  "detection_dc": 15,
  "disarm_dc": 10,
  "effect_description": "A 10-foot-deep pit lined with iron spikes. A creature that falls in takes bludgeoning damage from the fall plus piercing damage from the spikes.",
  "save_type": "DEX",
  "save_dc": 15,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d6",
    "type": "bludgeoning"
   },
   {
    "dice": "1d10",
    "type": "piercing"
   }
  ],
  "hazard_glyph": "pit",
  "tags": [
   "pit",
   "spikes",
   "classic",
   "dungeon"
  ],
  "notes": "A creature that fails the save takes 1d6 bludgeoning from the fall and 1d10 piercing from the spikes. Spikes make a +5 attack if you prefer to treat them as a separate attack."
 },
 {
  "id": "grimoire_poison_needle",
  "name": "Poison Needle",
  "description": "A tiny hole, no wider than a pin, sits beside the keyhole of an otherwise ordinary lock.",
  "trap_type": "Mechanical",
  "cr": "1/4",
  "trigger_type": "Other",
  "detection_dc": 20,
  "disarm_dc": 15,
  "effect_description": "A spring-loaded needle coated with poison fires from a concealed slot when a trapped lock or container is opened without disarming it first.",
  "save_type": "CON",
  "save_dc": 10,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d4",
    "type": "piercing"
   },
   {
    "dice": "2d10",
    "type": "poison"
   }
  ],
  "hazard_glyph": "dart_wall",
  "tags": [
   "lock",
   "poison",
   "needle"
  ],
  "notes": "The needle deals 1d4 piercing damage. On a failed CON save the creature also takes 2d10 poison damage and is poisoned for 1 hour."
 },
 {
  "id": "grimoire_poison_darts",
  "name": "Poison Darts",
  "description": "Rows of pin-sized holes pepper both walls of the corridor at waist height, and a few old darts lie in the dust.",
  "trap_type": "Mechanical",
  "cr": "1",
  "trigger_type": "Pressure Plate",
  "detection_dc": 15,
  "disarm_dc": 15,
  "effect_description": "Pressure-sensitive tiles in a 10-foot corridor trigger a fusillade of poisoned darts from tiny holes in the walls. All creatures in the corridor are targeted.",
  "save_type": "CON",
  "save_dc": 15,
  "attack_bonus": 8,
  "reset_type": "Manual",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d4",
    "type": "piercing"
   },
   {
    "dice": "2d10",
    "type": "poison"
   }
  ],
  "hazard_glyph": "dart_wall",
  "tags": [
   "darts",
   "poison",
   "corridor"
  ],
  "notes": "Each creature in the area is targeted by 1d3 darts (+8 to hit). Each hit deals 1d4 piercing damage, and the target makes a CON save or takes 2d10 poison damage."
 },
 {
  "id": "grimoire_rolling_sphere",
  "name": "Rolling Sphere",
  "description": "The corridor slopes gently downhill, and a long groove is worn into the floor. A recess in the ceiling is just wide enough to hide something very large.",
  "trap_type": "Mechanical",
  "cr": "3",
  "trigger_type": "Tripwire",
  "detection_dc": 15,
  "disarm_dc": 20,
  "effect_description": "A 10-foot-diameter iron sphere rolls down a 60-foot-long sloped corridor, smashing everything in its path before crashing into a wall or pit.",
  "save_type": "DEX",
  "save_dc": 15,
  "attack_bonus": 7,
  "reset_type": "Manual",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [
   {
    "dice": "4d10",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": "falling_block",
  "tags": [
   "boulder",
   "rolling",
   "corridor",
   "classic"
  ],
  "notes": "The sphere moves 60 feet per round. Creatures in its path make a DEX save (DC 15) or take 4d10 bludgeoning damage and are knocked prone. On a success they take half damage."
 },
 {
  "id": "grimoire_collapsing_roof",
  "name": "Collapsing Roof",
  "description": "Cracked masonry and a single prop beam hold up a low, sagging ceiling.",
  "trap_type": "Mechanical",
  "cr": "2",
  "trigger_type": "Tripwire",
  "detection_dc": 15,
  "disarm_dc": 15,
  "effect_description": "A tripwire releases a support beam, causing a 10-foot section of ceiling to collapse. Creatures in the area are buried under rubble and must be dug out.",
  "save_type": "DEX",
  "save_dc": 15,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "4d10",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": "falling_block",
  "tags": [
   "ceiling",
   "rubble",
   "collapse"
  ],
  "notes": "On a failed save, the creature is also restrained by the rubble. Another creature can use an action and succeed on a DC 15 Strength check to free it."
 },
 {
  "id": "grimoire_falling_net",
  "name": "Falling Net",
  "description": "A bundle of rope and lead weights is lashed to the ceiling in a rough square.",
  "trap_type": "Mechanical",
  "cr": "0",
  "trigger_type": "Tripwire",
  "detection_dc": 10,
  "disarm_dc": 15,
  "effect_description": "A tripwire drops a weighted net from the ceiling over a 10-foot-square area, restraining creatures caught beneath it.",
  "save_type": "DEX",
  "save_dc": 15,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": 20,
  "trap_ac": 10,
  "damage_immunities": [
   "bludgeoning",
   "poison",
   "psychic"
  ],
  "damage_entries": [],
  "hazard_glyph": "net",
  "tags": [
   "net",
   "restrained",
   "ceiling"
  ],
  "notes": "Creatures that fail the DEX save are restrained until freed. A creature can escape with a DC 10 Strength check as an action. The net (AC 10, 20 hit points) can also be cut with a slashing weapon."
 },
 {
  "id": "grimoire_fire_breathing_statue",
  "name": "Fire-Breathing Statue",
  "description": "A carved beast crouches on a plinth with its jaws open. Soot stains the wall and floor in front of it.",
  "trap_type": "Magical",
  "cr": "4",
  "trigger_type": "Magic Sensor",
  "detection_dc": 15,
  "disarm_dc": 13,
  "effect_description": "A gargoyle or dragon statue with a magic sensor breathes a cone of fire when a non-keyed creature approaches within 30 feet.",
  "save_type": "DEX",
  "save_dc": 13,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "4d10",
    "type": "fire"
   }
  ],
  "hazard_glyph": "flame_jet",
  "tags": [
   "fire",
   "statue",
   "magical",
   "cone"
  ],
  "notes": "The cone is 30 feet long. On a failed DEX save a creature takes 4d10 fire damage, or half as much on a success. The statue recharges and can fire again on the next round."
 },
 {
  "id": "grimoire_sphere_of_annihilation",
  "name": "Sphere of Annihilation",
  "description": "A perfectly black ball hangs in the air, and it seems to swallow the light around it. Dust drifts toward it and vanishes.",
  "trap_type": "Magical",
  "cr": "10",
  "trigger_type": "Proximity",
  "detection_dc": 20,
  "disarm_dc": null,
  "effect_description": "A 2-foot-diameter black sphere floats at the center of a room or corridor. Any creature or object that touches it is annihilated.",
  "save_type": null,
  "save_dc": null,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "4d10",
    "type": "force"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "sphere",
   "annihilation",
   "deadly",
   "magical"
  ],
  "notes": "It can be controlled with an Ioun Stone of Mastery or a similar effect. A creature reduced to 0 hit points by it is utterly destroyed. It cannot be disarmed by conventional means."
 },
 {
  "id": "grimoire_flooding_room",
  "name": "Flooding Room",
  "description": "A sealed stone room with a heavy door and a drain set in the middle of the floor. Water stains climb the walls in tide lines.",
  "trap_type": "Mechanical",
  "cr": "1",
  "trigger_type": "Manual",
  "detection_dc": 15,
  "disarm_dc": 20,
  "effect_description": "Once the door is closed (often by a weight plate or a delayed mechanism), concealed pipes begin flooding the room. The water rises 1 foot per round.",
  "save_type": "STR",
  "save_dc": 15,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [],
  "hazard_glyph": null,
  "tags": [
   "flood",
   "water",
   "room",
   "drowning"
  ],
  "notes": "At 3 feet, Medium creatures move at half speed. At 6 feet, non-swimming creatures begin to drown. Characters who fail the STR save each round cannot move against the current."
 },
 {
  "id": "grimoire_glyph_of_warding",
  "name": "Glyph of Warding",
  "description": "A faint, intricate rune is scratched into a door, chest or flagstone, easy to miss unless you look for it.",
  "trap_type": "Magical",
  "cr": "3",
  "trigger_type": "Visual",
  "detection_dc": 15,
  "disarm_dc": 13,
  "effect_description": "An explosive rune is carved into a surface or object. When a specified trigger condition is met (a creature touches it, opens it or passes over it), the glyph erupts.",
  "save_type": "DEX",
  "save_dc": 14,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "5d8",
    "type": "fire"
   }
  ],
  "hazard_glyph": "glyph",
  "tags": [
   "glyph",
   "magical",
   "explosive",
   "rune"
  ],
  "notes": "On a failed save a creature takes 5d8 damage of the chosen element (fire, cold, lightning and so on), or half as much on a success. Noticing the glyph takes a DC 15 Intelligence (Arcana) check."
 },
 {
  "id": "grimoire_alarm_bell_tripwire",
  "name": "Alarm Bell Tripwire",
  "description": "A thin cord runs across the passage at ankle height, disappearing into a small hole in the wall.",
  "trap_type": "Mechanical",
  "cr": "0",
  "trigger_type": "Tripwire",
  "detection_dc": 12,
  "disarm_dc": 10,
  "effect_description": "A nearly invisible string is stretched across a corridor at ankle height. If disturbed, it rings a bell or drops a bucket of rocks, alerting nearby guards.",
  "save_type": null,
  "save_dc": null,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [],
  "hazard_glyph": "alarm",
  "tags": [
   "alarm",
   "tripwire",
   "alert",
   "social"
  ],
  "notes": "No direct damage. Nearby guards are alerted and arrive after 1d4 rounds. A DC 12 Dexterity (Stealth) check can also disable it instead of using thieves' tools."
 },
 {
  "id": "grimoire_hampering_mushrooms",
  "name": "Hampering Mushrooms",
  "description": "A glowing carpet of pale mushrooms covers the floor and lower wall, pulsing softly.",
  "trap_type": "Environmental",
  "cr": "1/4",
  "trigger_type": "Proximity",
  "detection_dc": 12,
  "disarm_dc": null,
  "effect_description": "A patch of bioluminescent mushrooms releases a cloud of spores when disturbed. The spores disorient and slow creatures that inhale them.",
  "save_type": "CON",
  "save_dc": 12,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d4",
    "type": "poison"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "mushroom",
   "spores",
   "environmental",
   "slow"
  ],
  "notes": "On a failed CON save the creature is poisoned for 1 hour. While poisoned this way, its speed is halved and it cannot take reactions."
 },
 {
  "id": "grimoire_swinging_log_trap",
  "name": "Swinging Log Trap",
  "description": "A heavy log hangs from ropes high in the branches, hidden among the leaves above the path.",
  "trap_type": "Mechanical",
  "cr": "1/4",
  "trigger_type": "Tripwire",
  "detection_dc": 13,
  "disarm_dc": 12,
  "effect_description": "A tripwire in a forest or exterior passage releases a large suspended log that swings across the path, striking creatures in a 10-foot arc.",
  "save_type": "DEX",
  "save_dc": 13,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "3d6",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "log",
   "swinging",
   "outdoor",
   "forest"
  ],
  "notes": "A creature that fails the save is also knocked prone."
 },
 {
  "id": "grimoire_iron_gate_spikes",
  "name": "Iron Gate Spikes",
  "description": "Rows of narrow slots line the floor and ceiling of an archway. When the spikes thrust out, they leave gaps too narrow for a body to slip through, though a creature can see and shoot between them. The barrier grants three-quarters cover to anyone behind it.",
  "trap_type": "Mechanical",
  "cr": "1",
  "trigger_type": "Manual",
  "detection_dc": 12,
  "disarm_dc": 15,
  "effect_description": "Pulling a hidden lever drives iron spikes out of the floor and ceiling, sealing a doorway behind a barrier. A creature standing in the doorway makes a DEX save or takes piercing damage; on a success it chooses which side to jump to.",
  "save_type": "DEX",
  "save_dc": 12,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": 18,
  "trap_ac": 15,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [
   {
    "dice": "2d6",
    "type": "piercing"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "spikes",
   "lever",
   "barrier"
  ],
  "notes": "Use it to split a party or cut off a fleeing enemy. The barrier stays until the lever is thrown back or the spikes are destroyed (AC 15, 18 hit points per section, immune to poison and psychic). The lever can sit on either side of the gate, so a captured party member might be stuck beside it."
 },
 {
  "id": "grimoire_crumbling_column_gauntlet",
  "name": "Crumbling Column Gauntlet",
  "description": "The chamber floor is a field of stone columns rising from a dark pit, each a stride wide and slick with age. Faint runes mark some of their tops. A column that is safe to stand on can look no different from one that is not, until it clicks beneath a foot.",
  "trap_type": "Mechanical",
  "cr": "3",
  "trigger_type": "Other",
  "detection_dc": 16,
  "disarm_dc": 18,
  "effect_description": "Stepping on a wrong column makes several others drop into the pit below, leaving a narrowing route and, as the gaps grow, setting off additional wall-mounted traps.",
  "save_type": null,
  "save_dc": null,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [],
  "hazard_glyph": null,
  "tags": [
   "mechanical",
   "columns",
   "puzzle",
   "chamber"
  ],
  "notes": "This trap rewards careful movement. Decide before play which columns are safe and give a subtle tell, such as cleaner stone, a different rune or a slightly different sound underfoot. Raise the stakes with each misstep: more columns fall, the safe path shrinks, and once enough are gone, darts or spikes can fire from the walls. Tune the penalty to the party's care."
 },
 {
  "id": "grimoire_scything_blade_corridor",
  "name": "Scything Blade Corridor",
  "description": "Narrow vertical slots run along both walls of a long corridor, and the floor near them is scored with shallow arcs. Several flagstones sit just a little proud of their neighbours.",
  "trap_type": "Mechanical",
  "cr": "2",
  "trigger_type": "Pressure Plate",
  "detection_dc": 15,
  "disarm_dc": 15,
  "effect_description": "A pressure plate swings a row of curved blades out of the walls to sweep a 20-foot stretch of corridor. Each creature in the area makes a DEX save, taking slashing damage on a failure or half as much on a success.",
  "save_type": "DEX",
  "save_dc": 14,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "3d8",
    "type": "slashing"
   }
  ],
  "hazard_glyph": "blade",
  "tags": [
   "blades",
   "corridor",
   "slashing"
  ],
  "notes": "Telegraph with the scored floor and with old stains on the slots. Characters who find the plate can jam it with a spike or a wedge, or hold it down with a heavy object. The blades retract and re-arm on their own after 1 round."
 },
 {
  "id": "grimoire_collapsing_stair_ramp",
  "name": "Collapsing Stair Ramp",
  "description": "A broad stone staircase descends into dimness. The treads in the middle look worn smooth, and a thin seam runs along the edge of each one.",
  "trap_type": "Mechanical",
  "cr": "1/8",
  "trigger_type": "Pressure Plate",
  "detection_dc": 12,
  "disarm_dc": 12,
  "effect_description": "The middle steps of a staircase flip flat into a smooth ramp. Each creature on the stairs makes a DEX save or slides to the bottom, taking bludgeoning damage and landing prone.",
  "save_type": "DEX",
  "save_dc": 11,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d6",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": "collapsing_floor",
  "tags": [
   "stairs",
   "slide",
   "setback"
  ],
  "notes": "A setback trap more than a danger. It is best used to separate the party from anyone who reached the top, or to dump them into the next room at an awkward moment. A creature that succeeds on the save grabs the rail and stays on the steps. Climbing back up the ramp is a DC 10 Strength (Athletics) check."
 },
 {
  "id": "grimoire_sleep_gas_chest",
  "name": "Sleep-Gas Chest",
  "description": "An iron-banded chest sits on its own, its lid seated against a thin strip of soft leather. Tiny holes ring the inside of the rim, too small to notice at a glance.",
  "trap_type": "Hybrid",
  "cr": "1",
  "trigger_type": "Other",
  "detection_dc": 14,
  "disarm_dc": 14,
  "effect_description": "Opening the chest without disarming it releases a puff of sleeping gas from vents in the lid. Each creature within 10 feet makes a CON save or falls unconscious for 1 minute, waking if it takes damage or if another creature uses an action to shake it.",
  "save_type": "CON",
  "save_dc": 13,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": 20,
  "trap_ac": 15,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [],
  "hazard_glyph": null,
  "tags": [
   "gas",
   "chest",
   "sleep",
   "alchemical"
  ],
  "notes": "Pair it with something that would make falling asleep dangerous, such as a patrol or a rising tide, but be wary of killing sleeping characters. Holding breath gives advantage on the save, and a character who notices the vents can wedge the lid open with a tool instead of lifting it directly."
 },
 {
  "id": "grimoire_teleporter_rune",
  "name": "Teleporter Rune",
  "description": "A circle of silver inlay is set into the floor, with a pattern of angular marks around its edge. It hums softly when someone stands close.",
  "trap_type": "Magical",
  "cr": "1/2",
  "trigger_type": "Pressure Plate",
  "detection_dc": 14,
  "disarm_dc": 13,
  "effect_description": "A creature that steps on the rune must make a CHA save or be teleported to a paired rune elsewhere in the dungeon, unharmed. The rune works on one creature at a time.",
  "save_type": "CHA",
  "save_dc": 13,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [],
  "hazard_glyph": "glyph",
  "tags": [
   "teleport",
   "rune",
   "separation"
  ],
  "notes": "Harmless in itself; the danger is a split party. Choose where the other rune is before play, and decide whether the paired rune can be used to return. A creature that wants to be sent can choose to fail the save."
 },
 {
  "id": "grimoire_arrow_slit_wall",
  "name": "Arrow Slit Wall",
  "description": "A section of masonry is pierced by thin vertical gaps, each only a hand's width tall and set at chest height. Beyond them is darkness.",
  "trap_type": "Mechanical",
  "cr": "1/2",
  "trigger_type": "Pressure Plate",
  "detection_dc": 14,
  "disarm_dc": 14,
  "effect_description": "A wall of hidden slits looses a volley of arrows at everyone in a 15-foot-wide area. Each creature in the area is targeted by one arrow and takes piercing damage on a hit.",
  "save_type": null,
  "save_dc": null,
  "attack_bonus": 6,
  "reset_type": "Manual",
  "trap_hp": 15,
  "trap_ac": 15,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [
   {
    "dice": "2d6",
    "type": "piercing"
   }
  ],
  "hazard_glyph": "dart_wall",
  "tags": [
   "arrows",
   "wall",
   "ranged"
  ],
  "notes": "The mechanism fires once per trigger and has a limited number of arrows behind it, so after three volleys it needs reloading. Shields, cover and partial walls work as normal. The slits can be plugged by someone who gets next to them."
 },
 {
  "id": "grimoire_thin_ice",
  "name": "Thin Ice",
  "description": "A frozen pond or lake spreads out ahead, its surface pale and uneven. Near the middle the ice turns a darker grey, and fine cracks spread across it.",
  "trap_type": "Environmental",
  "cr": "1/4",
  "trigger_type": "Other",
  "detection_dc": 12,
  "disarm_dc": null,
  "effect_description": "A sheet of ice over deep, freezing water gives way under weight. A creature crossing it makes a DEX save or breaks through and drops into the water, taking cold damage at the start of each of its turns while submerged.",
  "save_type": "DEX",
  "save_dc": 12,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d6",
    "type": "cold"
   }
  ],
  "hazard_glyph": "collapsing_floor",
  "tags": [
   "ice",
   "water",
   "cold",
   "outdoor"
  ],
  "notes": "A DC 12 Wisdom (Survival) check spots the weak patches and a safe route. A creature in the water can climb out with a DC 12 Strength (Athletics) check, and heavy armour makes the check at disadvantage. Wet characters in cold air may suffer further effects at your discretion."
 },
 {
  "id": "grimoire_quicksand",
  "name": "Quicksand",
  "description": "A sandbank looks no different from the dry ground around it, though a faint sheen of moisture clings to the surface.",
  "trap_type": "Environmental",
  "cr": "1/4",
  "trigger_type": "Proximity",
  "detection_dc": 13,
  "disarm_dc": null,
  "effect_description": "A patch of wet sand hides a deep, sucking bog. A creature that steps on it makes a STR save or sinks to its waist and is restrained. A restrained creature sinks further each round until it is pulled free.",
  "save_type": "STR",
  "save_dc": 12,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [],
  "hazard_glyph": null,
  "tags": [
   "sand",
   "bog",
   "restrained",
   "outdoor"
  ],
  "notes": "A restrained creature can use an action to make a DC 12 Strength check to pull itself free. An ally on solid ground can add help with a rope or pole. If the creature fails three checks in a row, it sinks over its head and begins to suffocate. Dropped weight (a heavy pack) gives advantage on the checks."
 },
 {
  "id": "grimoire_rot_grub_nest",
  "name": "Rot Grub Nest",
  "description": "A heap of rotting carrion and sodden straw squirms with pale shapes, each the size of a finger.",
  "trap_type": "Environmental",
  "cr": "2",
  "trigger_type": "Proximity",
  "detection_dc": 12,
  "disarm_dc": null,
  "effect_description": "A rotting pile of bones, bedding or carcasses is riddled with burrowing grubs. A creature that disturbs it makes a DEX save or is swarmed and takes poison damage at the start of each of its turns until the grubs are scraped away.",
  "save_type": "DEX",
  "save_dc": 12,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "1d6",
    "type": "poison"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "grubs",
   "disease",
   "poison",
   "vermin"
  ],
  "notes": "A creature can end the damage by using an action to scrape the grubs off, or by dealing at least 1 fire damage to itself or the nest. Grubs left in place burrow in, and a creature that takes damage a third time must make a DC 12 Constitution save or suffer an infection at your discretion, to be cured by lesser restoration or similar magic."
 },
 {
  "id": "grimoire_crushing_walls_room",
  "name": "Crushing Walls Room",
  "description": "A square chamber with a heavy door and a sunken groove running along the floor beside two opposite walls. Dark stains mark the stone at hip height.",
  "trap_type": "Mechanical",
  "cr": "5",
  "trigger_type": "Pressure Plate",
  "detection_dc": 16,
  "disarm_dc": 18,
  "effect_description": "The door seals and opposite walls slowly grind together, closing 5 feet each round. Once they meet, every creature in the room must make a DEX save, taking heavy bludgeoning damage on a failure or half as much on a success.",
  "save_type": "DEX",
  "save_dc": 16,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": 60,
  "trap_ac": 19,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [
   {
    "dice": "6d10",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "walls",
   "crushing",
   "room",
   "deadly"
  ],
  "notes": "Treat this as a puzzle with a clock, not a damage roll. Give the party several rounds to find an exit: a hidden lever (DC 16 Investigation), jamming the walls with a strong prop (Strength check), or smashing a wall section (AC 19, 60 hit points per section). The walls move 5 feet per round and the room's width decides the clock."
 },
 {
  "id": "grimoire_lightning_arc_doorway",
  "name": "Lightning-Arc Doorway",
  "description": "A door frame is flanked by two bronze coils wrapped in green-tinged wire. A faint smell of ozone lingers, and the nearby flagstones are blackened.",
  "trap_type": "Hybrid",
  "cr": "4",
  "trigger_type": "Magic Sensor",
  "detection_dc": 15,
  "disarm_dc": 16,
  "effect_description": "Two metal coils on either side of a doorway spark and crackle when a creature without the keyed token passes. An arc of lightning leaps across the opening, and the creature makes a DEX save or takes lightning damage and cannot take reactions until the start of its next turn.",
  "save_type": "DEX",
  "save_dc": 15,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": 25,
  "trap_ac": 17,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [
   {
    "dice": "4d10",
    "type": "lightning"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "lightning",
   "doorway",
   "coils",
   "arcane"
  ],
  "notes": "Characters can bypass it by cutting the wire from one coil (a successful disarm), by spreading a conductor or earth between the two, or by carrying the keyed token. The arc triggers only once per creature per round. Metal-armoured characters might get disadvantage on the save at your discretion."
 },
 {
  "id": "grimoire_mirror_of_the_false_exit",
  "name": "Mirror of the False Exit",
  "description": "A standing mirror in a plain frame reflects the room, but a doorway shows in the glass where the real wall stands. The reflection of the party looks comfortable, and unharmed.",
  "trap_type": "Magical",
  "cr": "3",
  "trigger_type": "Visual",
  "detection_dc": 15,
  "disarm_dc": 14,
  "effect_description": "A tall mirror shows the viewer a doorway and a way out of the room. A creature that looks into it makes a WIS save or becomes convinced the reflection is a real exit, walking into the glass and taking psychic damage as the illusion shatters in its mind.",
  "save_type": "WIS",
  "save_dc": 14,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": 20,
  "trap_ac": 12,
  "damage_immunities": [
   "poison"
  ],
  "damage_entries": [
   {
    "dice": "3d8",
    "type": "psychic"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "mirror",
   "illusion",
   "psychic",
   "magical"
  ],
  "notes": "Characters who study the mirror from the side or in the dark can see the reflection does not match the room. A character who covers the glass or turns away is not affected. Breaking it ends the effect. A creature pulled out of the illusion by an ally can retry the save."
 },
 {
  "id": "grimoire_portcullis_drop",
  "name": "Portcullis Drop",
  "description": "Deep grooves run up the walls and into the ceiling of a narrow passage. Heavy chains disappear into the dark above.",
  "trap_type": "Mechanical",
  "cr": "1",
  "trigger_type": "Pressure Plate",
  "detection_dc": 14,
  "disarm_dc": 15,
  "effect_description": "A heavy iron grate slams down across a passage, separating the party. A creature standing under it makes a DEX save or takes bludgeoning damage and is pinned until the grate is lifted.",
  "save_type": "DEX",
  "save_dc": 13,
  "attack_bonus": null,
  "reset_type": "Manual",
  "trap_hp": 50,
  "trap_ac": 19,
  "damage_immunities": [
   "poison",
   "psychic"
  ],
  "damage_entries": [
   {
    "dice": "2d10",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": "falling_block",
  "tags": [
   "portcullis",
   "separation",
   "gate"
  ],
  "notes": "A creature that makes the save leaps to a side of its choice. Lifting the portcullis takes a DC 20 Strength check, or a lever or winch somewhere else in the dungeon. Creatures can see through the bars and attack through them as with three-quarters cover. Use it to force an encounter on one half of the party."
 },
 {
  "id": "grimoire_cursed_idol",
  "name": "Cursed Idol",
  "description": "A small golden idol with gemstone eyes sits on a stone plinth in an empty chamber. The plinth is slightly sunken, as if resting on a spring, and faint runes circle its base.",
  "trap_type": "Hybrid",
  "cr": "6",
  "trigger_type": "Other",
  "detection_dc": 16,
  "disarm_dc": 17,
  "effect_description": "Lifting the idol from its plinth without an equal weight triggers a slab to drop from above (DEX save for bludgeoning damage) and the idol curses whoever carries it. The bearer makes a CHA save or has its hit point maximum reduced by 2d10 until the curse is lifted.",
  "save_type": "CHA",
  "save_dc": 16,
  "attack_bonus": null,
  "reset_type": "None",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "5d10",
    "type": "bludgeoning"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "idol",
   "curse",
   "treasure",
   "hybrid"
  ],
  "notes": "The slab falls first and the curse takes hold in the same moment. A creature that succeeds on the DEX save takes no damage, but the curse still applies unless the CHA save is also passed. The curse ends with remove curse or similar magic. A bag of sand of matching weight swapped smoothly can avoid the trigger, but not the runes' magic if the idol is moved."
 },
 {
  "id": "grimoire_disintegration_arch",
  "name": "Disintegration Arch",
  "description": "A freestanding stone arch is carved with pale runes and filled with a veil of shimmering green light. Heaps of fine grey dust gather at its foot, some of it holding the shape of a boot or a belt buckle.",
  "trap_type": "Magical",
  "cr": "11",
  "trigger_type": "Magic Sensor",
  "detection_dc": 20,
  "disarm_dc": 19,
  "effect_description": "A stone arch holds a shimmering green veil that blasts any creature passing through it without the keyed token. The creature makes a DEX save, taking heavy force damage on a failure or half as much on a success. A creature reduced to 0 hit points is reduced to a pile of fine dust.",
  "save_type": "DEX",
  "save_dc": 19,
  "attack_bonus": null,
  "reset_type": "Automatic",
  "trap_hp": null,
  "trap_ac": null,
  "damage_immunities": [],
  "damage_entries": [
   {
    "dice": "10d10",
    "type": "force"
   }
  ],
  "hazard_glyph": null,
  "tags": [
   "arch",
   "force",
   "deadly",
   "high-level"
  ],
  "notes": "A deadly trap for high-level parties. Telegraph it clearly with the dust and runes, and give the party a way to bypass it: a keyed token, dispel magic on the veil (DC 19), or a hidden panel that lowers it. The veil recharges instantly, so every creature that passes triggers it."
 }
]$content$::jsonb)
on conflict (id) do nothing;

-- ── library_dungeon_features (30) ────────────────────────────────────
insert into public.library_dungeon_features (id, name, feature_type, description, perception_dc, investigation_dc, arcana_dc, trigger_type, trigger_description, contents_description, feature_glyph, tags, notes)
select id, name, feature_type, description, perception_dc, investigation_dc, arcana_dc, trigger_type, trigger_description, contents_description, feature_glyph, tags, notes
  from jsonb_populate_recordset(null::public.library_dungeon_features, $content$[
 {
  "id": "grimoire_sliding_stone_panel",
  "name": "Sliding Stone Panel",
  "feature_type": "Secret Door",
  "description": "The seam is almost invisible; only a faint draft or discoloration in the mortar betrays its presence.",
  "perception_dc": 15,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "Pressure Plate",
  "trigger_description": "A loose flagstone near the wall. Pressing it causes a 5-foot section of stone wall to slide silently aside.",
  "contents_description": "A narrow passage leading to an adjacent room or corridor.",
  "feature_glyph": "secret_door",
  "tags": [
   "stone",
   "classic",
   "dungeon"
  ],
  "notes": null
 },
 {
  "id": "grimoire_rotating_bookshelf",
  "name": "Rotating Bookshelf",
  "feature_type": "Secret Door",
  "description": "The bookshelf sits flush with the wall and rotates silently. The books on it are fixed in place: dummies glued to the shelves.",
  "perception_dc": 15,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "Bookshelf",
  "trigger_description": "Pulling a specific red-spined tome tilts it forward, triggering a spring that pivots the entire bookshelf 90 degrees on a central axle.",
  "contents_description": "A musty corridor or hidden study beyond.",
  "feature_glyph": "secret_door",
  "tags": [
   "library",
   "study",
   "classic"
  ],
  "notes": "The correct book can be identified by a faint wear mark on its spine or a DC 13 Investigation check."
 },
 {
  "id": "grimoire_candlestick_lever",
  "name": "Candlestick Lever",
  "feature_type": "Secret Door",
  "description": "The triggering candlestick wobbles slightly if tested; a sharp-eyed character notices it isn't fixed to the wall.",
  "perception_dc": 13,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "Candlestick",
  "trigger_description": "One of three wall-mounted candlesticks can be pushed upward. This releases a latch and causes a section of stone wall to swing inward.",
  "contents_description": "A hidden alcove or short passage.",
  "feature_glyph": "secret_door",
  "tags": [
   "candlestick",
   "dungeon",
   "classic"
  ],
  "notes": null
 },
 {
  "id": "grimoire_keyword_sealed_door",
  "name": "Keyword-Sealed Door",
  "feature_type": "Secret Door",
  "description": "The wall hums faintly with enchantment. A detect magic spell reveals a transmutation aura. The keyword may be discovered through lore, an NPC, or a DC 18 Arcana check.",
  "perception_dc": 18,
  "investigation_dc": 15,
  "arcana_dc": 12,
  "trigger_type": "Keyword",
  "trigger_description": "A section of featureless wall that opens only when the correct word or phrase is spoken aloud in Common (or the language inscribed on a nearby clue).",
  "contents_description": "A vault, shrine, or private chamber beyond.",
  "feature_glyph": "secret_door",
  "tags": [
   "magical",
   "keyword",
   "vault"
  ],
  "notes": null
 },
 {
  "id": "grimoire_mirror_portal",
  "name": "Mirror Portal",
  "feature_type": "Secret Door",
  "description": "The mirror reflects normally but is cool to the touch and shows no dust. Objects held very close produce a faint ripple in the reflection.",
  "perception_dc": 20,
  "investigation_dc": 18,
  "arcana_dc": 14,
  "trigger_type": "Magic Sensor",
  "trigger_description": "Pressing a hand to the glass while concentrating (bonus action) activates the portal; the mirror becomes translucent and allows passage for 1 minute.",
  "contents_description": "A demi-plane antechamber or magically hidden room.",
  "feature_glyph": "secret_door",
  "tags": [
   "magical",
   "portal",
   "mirror"
  ],
  "notes": "A dispel magic (DC 14) suppresses the portal for 1 hour."
 },
 {
  "id": "grimoire_crawlspace_behind_tapestry",
  "name": "Crawlspace Behind Tapestry",
  "feature_type": "Hidden Passage",
  "description": "A heavy tapestry hangs 6 inches from the wall, concealing a gap in the stonework. Air movement causes it to sway faintly.",
  "perception_dc": 12,
  "investigation_dc": 8,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "The passage has no mechanism: simply push the tapestry aside to enter.",
  "contents_description": "A low 3-foot-wide crawlspace connecting two rooms. Medium or larger creatures must squeeze.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "crawlspace",
   "tapestry",
   "simple"
  ],
  "notes": null
 },
 {
  "id": "grimoire_sewage_tunnel_access",
  "name": "Sewage Tunnel Access",
  "feature_type": "Hidden Passage",
  "description": "The grate is discolored and damp. Characters who pass through must deal with the stench (DC 10 CON or disadvantage on Perception for 10 minutes).",
  "perception_dc": 10,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "A rusted iron grate set into the floor or lower wall, secured with a simple bolt from the inside.",
  "contents_description": "A foul-smelling sewer tunnel running beneath the building or dungeon level. Connects to the exterior or another section.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "sewer",
   "tunnel",
   "urban",
   "dungeon"
  ],
  "notes": null
 },
 {
  "id": "grimoire_chimney_shaft",
  "name": "Chimney Shaft",
  "feature_type": "Hidden Passage",
  "description": "Soot-stained but cold; this fireplace hasn't been used in years. A Perception DC 14 check notices the iron rungs inside.",
  "perception_dc": 14,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "An oversized, disused fireplace. The flue has been widened and a series of iron rungs driven into the stone lead upward.",
  "contents_description": "A vertical shaft climbing 30 to 60 feet to an upper floor or rooftop exit. Climbing DC 10.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "chimney",
   "vertical",
   "escape route"
  ],
  "notes": null
 },
 {
  "id": "grimoire_iron_banded_chest",
  "name": "Iron-Banded Chest",
  "feature_type": "Treasure Chest",
  "description": "A sturdy iron-reinforced wooden chest, 3 feet wide. No traps, just a lock.",
  "perception_dc": null,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "Key",
  "trigger_description": "Standard iron lock (DC 15 Thieves' Tools to pick). The key is held by the dungeon's owner or hidden nearby.",
  "contents_description": "Coin (DM discretion), gems, or minor magic items appropriate to the dungeon level.",
  "feature_glyph": null,
  "tags": [
   "chest",
   "loot",
   "standard"
  ],
  "notes": "Consider adding a trap to a chest of this type for higher-level dungeons."
 },
 {
  "id": "grimoire_mimics_favourite_shape",
  "name": "Mimic's Favourite Shape",
  "feature_type": "Treasure Chest",
  "description": "Looks identical to a normal wooden chest, but the wood grain is faintly irregular, and the chest has no keyhole.",
  "perception_dc": 18,
  "investigation_dc": 18,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "The 'chest' is actually a mimic in disguise. It attacks the first creature that touches it.",
  "contents_description": "Nothing: it is the mimic. Any treasure is at the DM's discretion after the mimic is defeated.",
  "feature_glyph": null,
  "tags": [
   "mimic",
   "trap",
   "monster"
  ],
  "notes": "Mimic: MM p.220. It has Adhesive (grapples on hit), False Appearance, and Ambusher. A DC 18 Perception (smell: faint organic odor) or Investigation reveals the deception."
 },
 {
  "id": "grimoire_loose_flagstone_cache",
  "name": "Loose Flagstone Cache",
  "feature_type": "Hidden Cache",
  "description": "One flagstone sits fractionally higher than its neighbours and is not mortared in place.",
  "perception_dc": 15,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "A flagstone that rocks slightly underfoot. Prying it up (no tool required, just effort) reveals a hollow beneath.",
  "contents_description": "A small waterproof pouch containing coins, a folded note, or a small magic item.",
  "feature_glyph": "cache",
  "tags": [
   "floor",
   "stash",
   "cache"
  ],
  "notes": null
 },
 {
  "id": "grimoire_hollowed_statue",
  "name": "Hollowed Statue",
  "feature_type": "Hidden Cache",
  "description": "A stone statue of a god or ancestor figure. The base bears a faded holy symbol. Careful inspection reveals the arm moves.",
  "perception_dc": 18,
  "investigation_dc": 14,
  "arcana_dc": null,
  "trigger_type": "Combination",
  "trigger_description": "Rotating the statue's left arm 90° clockwise, then pressing the symbol on its base, opens a compartment in the chest.",
  "contents_description": "A small cavity holding a scroll, a vial, or a folded document.",
  "feature_glyph": "statue",
  "tags": [
   "statue",
   "compartment",
   "religious"
  ],
  "notes": null
 },
 {
  "id": "grimoire_behind_the_waterfall",
  "name": "Behind the Waterfall",
  "feature_type": "Hidden Cache",
  "description": "A natural or constructed waterfall conceals a narrow ledge or cave mouth. Characters approaching within 10 feet can spot the shadow of a space behind the water.",
  "perception_dc": 14,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "No mechanism: simply walk or swim through the curtain of falling water.",
  "contents_description": "A dry cave shelf or alcove hidden by the falling water, containing stored goods or a fugitive's stash.",
  "feature_glyph": "fountain",
  "tags": [
   "waterfall",
   "natural",
   "cave"
  ],
  "notes": "Characters passing through the waterfall are soaked (disadvantage on Stealth until dried, about 1 hour)."
 },
 {
  "id": "grimoire_priests_hole",
  "name": "Priest's Hole",
  "feature_type": "Concealed Alcove",
  "description": "Built to hide a person in plain sight (a priest, a noble, or a spy). The panelling is carefully finished to match the surrounding wall.",
  "perception_dc": 16,
  "investigation_dc": 13,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "A section of panelling that swings inward on hidden hinges when pressed at one edge.",
  "contents_description": "A narrow stand-up space (2×3 ft) with a shelf, a stool, and perhaps a peephole into the adjacent room.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "hiding spot",
   "noble",
   "espionage"
  ],
  "notes": "A character hiding here gains advantage on Stealth checks against observers in the adjacent room (due to the peephole allowing them to time movement)."
 },
 {
  "id": "grimoire_recessed_weapon_rack",
  "name": "Recessed Weapon Rack",
  "feature_type": "Concealed Alcove",
  "description": "The panel matches the surrounding stonework. A thin seam and a slight chill from the air gap behind betray its presence.",
  "perception_dc": 14,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "A wall panel that slides aside (DC 10 Strength or Investigation to find the grip).",
  "contents_description": "A rack holding 4 to 6 weapons (shortbows, shortswords, crossbows) kept in reserve: an ambush cache or emergency armoury.",
  "feature_glyph": "cache",
  "tags": [
   "weapons",
   "armoury",
   "ambush"
  ],
  "notes": null
 },
 {
  "id": "grimoire_counterweight_portcullis_wall",
  "name": "Counterweight Portcullis Wall",
  "feature_type": "Moving Wall",
  "description": "The floor has parallel grooves where the slab descends. Debris in the grooves indicates it hasn't been used recently.",
  "perception_dc": 13,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "Lever",
  "trigger_description": "An iron lever set into the wall on one side only. Pulling it raises a heavy stone slab on a counterweight, opening a 10-foot-wide passage.",
  "contents_description": "Access to a sealed chamber, vault, or escape route.",
  "feature_glyph": "moving_wall",
  "tags": [
   "counterweight",
   "slab",
   "mechanism"
  ],
  "notes": "The lever can also be operated with a DC 18 Strength check if the counterweight is jammed. The wall slab has AC 17 and 80 HP."
 },
 {
  "id": "grimoire_puzzle_lock_moving_wall",
  "name": "Puzzle-Lock Moving Wall",
  "feature_type": "Moving Wall",
  "description": "The wall section is faintly different in texture from the surrounding stone, slightly smoother, with no mortar lines. The tiles are set into it at chest height.",
  "perception_dc": 15,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "Puzzle",
  "trigger_description": "A series of stone tiles on the wall face, each carved with a symbol, must be pressed in the correct sequence. Solving the puzzle (DC 15 Investigation or specific knowledge) causes the wall to grind aside.",
  "contents_description": "A sealed vault or hidden shrine.",
  "feature_glyph": "moving_wall",
  "tags": [
   "puzzle",
   "tiles",
   "vault"
  ],
  "notes": "Wrong sequence: nothing happens on first two mistakes. Third mistake triggers a minor alarm (bell or magical flash). Fourth mistake locks the puzzle for 24 hours."
 },
 {
  "id": "grimoire_false_bottom_chest",
  "name": "False-Bottom Chest",
  "feature_type": "Treasure Chest",
  "description": "A plain, unlocked chest holding a few cheap trinkets: candle stubs, a tarnished spoon, a cracked mirror. The chest looks deeper outside than it is inside.",
  "perception_dc": null,
  "investigation_dc": 15,
  "arcana_dc": null,
  "trigger_type": "Other",
  "trigger_description": "Pressing the two brass studs inside the lid at the same time releases the lower panel, which lifts out in one piece.",
  "contents_description": "A shallow compartment holding a velvet pouch with 2d10 gp and a small gem worth 50 gp, or a sealed letter.",
  "feature_glyph": null,
  "tags": [
   "chest",
   "false bottom",
   "loot"
  ],
  "notes": "Measure the inside against the outside: a DC 10 Investigation check notices a hand's width missing. A careless dumping of the contents jams the panel, and it must then be forced (DC 15 Strength or thieves' tools)."
 },
 {
  "id": "grimoire_trick_lock_coffer",
  "name": "Trick Lock Coffer",
  "feature_type": "Treasure Chest",
  "description": "A small, handsome coffer with an ornate lock. The keyhole is clean but scratch-free, and the three rings on the lid turn a little too smoothly for decoration.",
  "perception_dc": null,
  "investigation_dc": 17,
  "arcana_dc": null,
  "trigger_type": "Combination",
  "trigger_description": "The keyhole is a decoy. Turning the three engraved rings on the lid to match the carving on the front (a sun, a moon, a star) releases a hidden latch.",
  "contents_description": "A silver-bound coffer with 3d6 x 10 gp in mixed coin and one uncommon trinket suited to the dungeon.",
  "feature_glyph": null,
  "tags": [
   "chest",
   "puzzle",
   "lock"
  ],
  "notes": "Picking the false lock is DC 15 and does nothing, but a failure by 5 or more jams the real latch (DC 20 to clear). A character who spots the rings can try all combinations in 10 minutes if the party has time."
 },
 {
  "id": "grimoire_hearthstone_stair",
  "name": "Hearthstone Stair",
  "feature_type": "Hidden Passage",
  "description": "A wide fireplace with a hearthstone worn smooth on one side only. The ashes are damp and clumped near the back, and no soot stains the lintel.",
  "perception_dc": 16,
  "investigation_dc": 13,
  "arcana_dc": null,
  "trigger_type": "Pressure Plate",
  "trigger_description": "Standing on the raised hearthstone and shifting weight to the left edge tips the stone and the hearth floor behind it, exposing a stair.",
  "contents_description": "A spiral stair descending 20 feet to a cellar, a cold storage vault or a lower passage.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "fireplace",
   "stair",
   "cellar"
  ],
  "notes": "If the party lights a fire, the stone will not tip safely until it cools (1 hour). Lingering cold air from the stair makes the fire gutter, a fair clue for a player who asks."
 },
 {
  "id": "grimoire_portrait_with_eyeholes",
  "name": "Portrait with Eyeholes",
  "feature_type": "Concealed Alcove",
  "description": "A formal portrait whose eyes seem to follow the viewer. The pupils are slightly too dark, and a faint breath of stale air drifts from them.",
  "perception_dc": 14,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "A narrow door behind the frame opens when the bottom edge is pulled forward. A hidden watcher can see through holes cut in the painted eyes.",
  "contents_description": "A cramped watch space 2 feet deep with a stool and a small shelf, holding a candle stub and a half-finished letter.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "portrait",
   "spy",
   "alcove"
  ],
  "notes": "A watcher gains advantage on Perception checks to hear and spot activity in the room. Characters who stand under the portrait and speak low may notice a muffled cough (DC 13 Perception)."
 },
 {
  "id": "grimoire_pivoting_floor_slab",
  "name": "Pivoting Floor Slab",
  "feature_type": "Hidden Passage",
  "description": "A broad floor slab in a gallery, ringed by a hairline gap. Dust is thinner along one edge, and a dropped coin rolls toward the middle.",
  "perception_dc": 17,
  "investigation_dc": 14,
  "arcana_dc": null,
  "trigger_type": "Pressure Plate",
  "trigger_description": "Stepping on the slab's marked corner tips it on a central axle. Anyone standing on the far half must succeed on a DC 12 Dexterity saving throw or slide down.",
  "contents_description": "A chute or stair to a lower chamber, 10 feet below (1d6 bludgeoning damage if a creature falls instead of climbing).",
  "feature_glyph": "hidden_passage",
  "tags": [
   "floor",
   "pivot",
   "trapdoor"
  ],
  "notes": "Used on purpose, the slab is a safe, quiet entrance for those who know it. Wedging it with an iron spike (DC 10) keeps it open or shut."
 },
 {
  "id": "grimoire_wine_cask_door",
  "name": "Wine-Cask Door",
  "feature_type": "Secret Door",
  "description": "A long cellar rack of casks with one that sits a little proud of the rest. It sounds hollow when knocked, and no drip stains the floor below.",
  "perception_dc": 14,
  "investigation_dc": 11,
  "arcana_dc": null,
  "trigger_type": "Other",
  "trigger_description": "The largest cask in the rack is a false front. Lifting its tap and turning it a half circle unlocks the cask's face, which swings out like a door.",
  "contents_description": "A narrow passage to a smuggler's tunnel, a hidden cellar or a private strongroom.",
  "feature_glyph": "secret_door",
  "tags": [
   "cellar",
   "cask",
   "smuggler"
  ],
  "notes": "Characters who shake or lift the cask find it empty and light (DC 10 Strength to lift). Opening it with force splits the staves, which is loud: anyone within 60 feet hears it."
 },
 {
  "id": "grimoire_dumbwaiter_shaft",
  "name": "Dumbwaiter Shaft",
  "feature_type": "Hidden Passage",
  "description": "A small wooden hatch in the serving wall, easily mistaken for a cupboard. Greasy rope tracks and grooves in the frame show it still sees use.",
  "perception_dc": 15,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "Lever",
  "trigger_description": "A crank beside the serving hatch raises and lowers the cage. It carries up to 200 pounds; two Small creatures can fit, or one Medium creature squeezed in.",
  "contents_description": "A shaft linking the kitchen to an upper pantry or study, 15 to 30 feet up. A creature climbing the ropes needs DC 12 Athletics.",
  "feature_glyph": "hidden_passage",
  "tags": [
   "servant",
   "shaft",
   "vertical"
  ],
  "notes": "The hoist is loud. Moving the cage with Stealth requires a DC 14 Dexterity (Stealth) check for each trip, or the people above hear it."
 },
 {
  "id": "grimoire_illusory_wall",
  "name": "Illusory Wall",
  "feature_type": "Secret Door",
  "description": "A dead-end corridor with a plain stone wall. A thrown object passes straight through, and the torchlight on the wall does not flicker with the rest.",
  "perception_dc": null,
  "investigation_dc": 15,
  "arcana_dc": 15,
  "trigger_type": "Magic Sensor",
  "trigger_description": "The wall is a permanent illusion that can be touched without effect. A creature can pass through by physical interaction, but the illusion shows no sign of a door.",
  "contents_description": "A hidden chamber or corridor continuing past what appears to be a dead end.",
  "feature_glyph": "secret_door",
  "tags": [
   "illusion",
   "magic",
   "dead end"
  ],
  "notes": "A detect magic spell shows an illusion aura. A creature that studies the wall and succeeds on an Investigation check (DC 15) sees through it, as does anyone who touches it and makes the discovery. Do not use Perception here; the wall is flawless to the eye."
 },
 {
  "id": "grimoire_altar_with_hidden_reliquary",
  "name": "Altar with Hidden Reliquary",
  "feature_type": "Other",
  "description": "A stone altar with a worn flame carving. The holy symbol on top is scratched in a ring pattern, and the altar is a few inches off-centre of its floor mark.",
  "perception_dc": 16,
  "investigation_dc": 13,
  "arcana_dc": null,
  "trigger_type": "Button / Knob",
  "trigger_description": "Pressing the carved flame on the altar's front face while twisting the holy symbol on top slides the altar slab aside.",
  "contents_description": "A lead-lined reliquary holding a sacred relic and a small purse of offerings (2d6 x 5 gp). Removing the relic may anger the site's guardians.",
  "feature_glyph": "altar",
  "tags": [
   "altar",
   "religious",
   "reliquary"
  ],
  "notes": "Pious characters can find the twist with a DC 12 Religion check. Desecration or use of force wakes any guardian or curse the DM has placed."
 },
 {
  "id": "grimoire_draining_fountain_basin",
  "name": "Draining Fountain Basin",
  "feature_type": "Other",
  "description": "A quiet courtyard fountain with water that is oddly still and clear. Green stains on the stone suggest the water level has been far lower at times.",
  "perception_dc": 15,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "Lever",
  "trigger_description": "A submerged lever beneath the spout drains the basin in 1 minute and reveals a stair beneath the stone fountain pedestal.",
  "contents_description": "A flooded stair leading down 15 feet to a dry vault, whose air smells of damp stone and old iron.",
  "feature_glyph": "fountain",
  "tags": [
   "fountain",
   "water",
   "stair"
  ],
  "notes": "A character who wades in and searches the bottom can feel the lever (DC 13 Investigation). Water refills in 10 minutes, and the stair floods again."
 },
 {
  "id": "grimoire_password_inscription",
  "name": "Password Inscription",
  "feature_type": "Other",
  "description": "A carved verse on a dungeon wall, framed by a plain border. One of the lines is written in a different hand and the first letters of each line are slightly deeper.",
  "perception_dc": 12,
  "investigation_dc": 10,
  "arcana_dc": null,
  "trigger_type": "Keyword",
  "trigger_description": "Speaking the word hidden in the verse (an acrostic of its first letters) opens a stone door in the wall. The words must be spoken aloud.",
  "contents_description": "A shrine antechamber, a library vault or a small cache, as the DM chooses.",
  "feature_glyph": "inscription",
  "tags": [
   "inscription",
   "riddle",
   "password"
  ],
  "notes": "Give the verse as a handout. A DC 13 Investigation check reveals the acrostic, or a DC 10 Intelligence check if the party already suspects it. Wrong words do nothing, but loud repeated attempts may draw attention."
 },
 {
  "id": "grimoire_rubble_choke_crawlway",
  "name": "Rubble Choke Crawlway",
  "feature_type": "Other",
  "description": "A heap of fallen stone at the end of a hall. Fresh air seeps through the gaps, and tiny drifts of dust show where something has been shifted from behind.",
  "perception_dc": 14,
  "investigation_dc": 12,
  "arcana_dc": null,
  "trigger_type": "None",
  "trigger_description": "Clearing the rubble takes 10 minutes for two creatures, or 1 hour for one. A DC 12 Strength check pulls the keystone loose; failure sets off a minor cave-in (2d6 bludgeoning, DC 12 Dexterity save for half).",
  "contents_description": "A low crawlway, 3 feet high, leading to a side chamber or an old collapsed corridor.",
  "feature_glyph": "rubble",
  "tags": [
   "rubble",
   "crawlway",
   "collapse"
  ],
  "notes": "The collapse looks old but was stacked on purpose. A character who studies the pile and succeeds on DC 13 Investigation can pick a stable way through without risk."
 },
 {
  "id": "grimoire_rising_pillar_bridge",
  "name": "Rising Pillar Bridge",
  "feature_type": "Moving Wall",
  "description": "A wide chasm with a lever alcove on the near side. The pit walls are scored with vertical grooves, and each stone ledge has a circular seam on top.",
  "perception_dc": 15,
  "investigation_dc": 13,
  "arcana_dc": null,
  "trigger_type": "Lever",
  "trigger_description": "Turning a wheel in the alcove raises a series of stone pillars from the pit floor, one every 6 seconds, to form a stepping path across a 40-foot chasm.",
  "contents_description": "The far side of a chasm, with a gallery, a door or a treasure room beyond.",
  "feature_glyph": "moving_wall",
  "tags": [
   "pit",
   "pillars",
   "mechanism"
  ],
  "notes": "The pillars lower after 1 minute unless the wheel is held. Each step needs a DC 10 Acrobatics check if the party is hurrying. Failing by 5 or more drops a creature into the pit (3d6 falling damage)."
 }
]$content$::jsonb)
on conflict (id) do nothing;

-- ── library_puzzles (12) ─────────────────────────────────────────────
insert into public.library_puzzles (id, name, puzzle_type, difficulty, description, read_aloud, solution, hints, skill_checks, success_outcome, failure_consequence, tags, notes)
select id, name, puzzle_type, difficulty, description, read_aloud, solution, hints, skill_checks, success_outcome, failure_consequence, tags, notes
  from jsonb_populate_recordset(null::public.library_puzzles, $content$[
 {
  "id": "grimoire_three_doors",
  "name": "The Three Doors",
  "puzzle_type": "Logic",
  "difficulty": "Medium",
  "description": "The party enters a circular chamber with three identical iron doors set into the walls. Above each door is carved a single symbol: a sun, a moon, and a star. A stone tablet in the centre of the room bears the inscription:\n\n\"One door leads to life, one to riches, one to ruin. The guardian of the sun always lies. The guardian of the moon always speaks truth. The guardian of the star may do either. Ask, and ye shall choose wisely, or not at all.\"\n\nThree robed figures stand before the doors, faces hidden beneath deep hoods.",
  "read_aloud": null,
  "solution": "Players must identify which figure is Sun (liar), Moon (truth-teller), or Star (random) by asking each one a single yes/no question, ideally a self-referential one such as \"If I asked the other two whether your door leads to life, would they both say yes?\"\n\nCorrect door: Moon (truth-teller's door leads to life). The answer is whichever door the Moon-guardian points to when asked a nested truth question. Swap the correct door for your dungeon. The riddle is classic Knights-and-Knaves logic; the key insight is that a truth-teller giving a nested answer about a liar will always invert twice and arrive at truth.",
  "hints": [
   {
    "order": 1,
    "text": "The inscription says only one figure always tells the truth."
   },
   {
    "order": 2,
    "text": "What would happen if you asked a liar about a truth-teller's answer? The lie about the truth cancels out."
   },
   {
    "order": 3,
    "text": "Ask one of them: \"If I asked the Moon guardian whether your door is safe, what would they say?\" A truth-teller will tell you what the Moon guardian would say. A liar will lie about what the Moon guardian would say, which means both routes point to the same answer."
   },
   {
    "order": 4,
    "text": "The Moon guardian's door leads to life. Use a double-negative question to find it without knowing who the Moon guardian is."
   }
  ],
  "skill_checks": [
   {
    "skill": "Investigation",
    "dc": 14
   },
   {
    "skill": "History",
    "dc": 12
   },
   {
    "skill": "Insight",
    "dc": 16
   }
  ],
  "success_outcome": "The chosen door swings open silently to reveal a passage beyond. The three robed figures bow in unison and dissolve into smoke.",
  "failure_consequence": "If the party chooses the ruin door, it opens to a 10-foot pit (DC 15 DEX save or 2d6 bludgeoning damage). The door seals behind them and the puzzle resets; the correct door changes each reset.",
  "tags": [
   "logic",
   "riddle",
   "knights-and-knaves",
   "classic",
   "social"
  ],
  "notes": "Assign the correct door before the session. Hint 3 is effectively the solution; only give it if the party is truly stuck. The three guardians should refuse to answer any question about each other's identities directly."
 },
 {
  "id": "grimoire_celestial_orrery",
  "name": "The Celestial Orrery",
  "puzzle_type": "Arcane",
  "difficulty": "Hard",
  "description": "The vaulted ceiling of this chamber is painted with a star map. At the centre stands a brass orrery, a mechanical model of the solar system, whose rings, planets, and moons are all frozen in place, encrusted with verdigris.\n\nOn a lectern beside it rests an open tome describing the \"Grand Conjunction\", a celestial alignment that occurs every 400 years and is said to open the vault of the arch-mage Verandis. An astrological chart shows the correct positions of seven heavenly bodies.\n\nThe orrery has seven concentric rings, each with a gemstone \"planet\" that can be rotated. A faint humming grows louder as correct positions are achieved.",
  "read_aloud": null,
  "solution": "Players must rotate each of the seven rings to match the astrological chart in the tome. The correct order (from innermost to outermost ring) is: Mercury → Venus → Earth → Mars → Jupiter → Saturn → the Wandering Star (a fictional eighth body unique to the setting).\n\nEach ring clicks into a notch at 12 equally-spaced positions (like a clock face). The tome's chart shows each body at a specific \"hour\" position. Arcana checks reveal whether a given ring is correctly placed. Once all seven lock, the ceiling map glows and a hidden compartment opens in the lectern base.",
  "hints": [
   {
    "order": 1,
    "text": "The tome is the key; the astrological chart is not decorative."
   },
   {
    "order": 2,
    "text": "Each ring has 12 notched positions. The chart shows each planet at a specific position as if on a clock face."
   },
   {
    "order": 3,
    "text": "Arcana DC 12 after placing a ring: you sense a faint resonance if it is correct."
   },
   {
    "order": 4,
    "text": "The Wandering Star (outermost ring) is not in any real catalogue; its position is described only in the final page of the tome, in cipher. The cipher is a simple Caesar shift of 3."
   }
  ],
  "skill_checks": [
   {
    "skill": "Arcana",
    "dc": 15
   },
   {
    "skill": "Investigation",
    "dc": 12
   },
   {
    "skill": "History",
    "dc": 14
   }
  ],
  "success_outcome": "A resonant chord fills the chamber as all seven gems glow in sequence. The ceiling map blazes with golden light and the compartment in the lectern base clicks open, revealing the arch-mage's personal spellbook and a brass key.",
  "failure_consequence": "Forcing a ring past its notch or attempting to remove a gem triggers an alarm: a spectral guardian (Arcane Wraith, CR 5) materialises and attacks. It vanishes when reduced to 0 HP or when the party leaves, and the orrery resets.",
  "tags": [
   "arcane",
   "orrery",
   "celestial",
   "mechanics",
   "investigation"
  ],
  "notes": "Prepare a physical or digital copy of the astrological chart to hand to the players; it makes the puzzle tactile. The cipher on the final page: shift each letter back 3 (D→A, E→B, etc.). The Wandering Star should be at position 7 (the \"7 o'clock\" notch)."
 },
 {
  "id": "grimoire_waterway_vault",
  "name": "The Waterway Vault",
  "puzzle_type": "Physical",
  "difficulty": "Easy",
  "description": "A damp stone room with four stone basins of different sizes, connected by a network of iron channels and stoppered pipes. The basins are labelled I, II, III, and IV (from smallest to largest). Basin IV is bone dry.\n\nA carved inscription on the wall reads: \"Fill the final vessel with precisely eight pints, and the gate shall yield.\"\n\nWater flows freely from a spigot above basin I. A brass dial on the wall shows the current fill level of basin IV. The channel stoppers can be arranged to route water from any basin to any other, but once the water flows, it cannot be recalled.",
  "read_aloud": null,
  "solution": "The basins hold 3, 5, 11, and 8 pints respectively (I, II, III, IV). Players must leave exactly 8 pints in basin IV.\n\nIntended solution: fill basin III (11 pints) from the spigot via basin I, then pour it into basin IV until IV is full. IV holds exactly 8 pints, and the remaining 3 pints stay in III. The dial snaps to 8.\n\nAlternate route: fill basin II (5 pints) and basin I (3 pints) and empty both into IV. 5 + 3 = 8.",
  "hints": [
   {
    "order": 1,
    "text": "Think about which basins can fill or leave behind exactly 8 pints."
   },
   {
    "order": 2,
    "text": "A simpler route: fill the 11-pint basin completely, then pour water from it into basin IV (8-pint) until it overflows. Whatever fits in IV is exactly 8."
   },
   {
    "order": 3,
    "text": "Basin III holds 11 pints. Basin IV holds 8. Fill III to the brim, then pour it directly into IV until IV is full. The overflow is wasted, but IV will contain exactly 8 pints."
   }
  ],
  "skill_checks": [
   {
    "skill": "Investigation",
    "dc": 10
   },
   {
    "skill": "Athletics",
    "dc": 8
   }
  ],
  "success_outcome": "The brass dial snaps to 8 and a satisfying clunk echoes through the floor. A section of the wall slides aside to reveal a dry alcove containing a waterproof iron chest.",
  "failure_consequence": "If the party empties all basins simultaneously (a common mistake), the spigot seals for 1 hour before resetting. There is no damage or combat consequence, just time lost.",
  "tags": [
   "physical",
   "water",
   "measurement",
   "pouring",
   "classic"
  ],
  "notes": "This is a low-stakes puzzle good for early dungeons or as a palate cleanser between combat encounters. If players get frustrated, hint 3 is a complete handholding solution; that's intentional for a difficulty-Easy puzzle. The direct pour from the 11-pint basin into the 8-pint basin is the intended elegant solution."
 },
 {
  "id": "grimoire_weighing_idols",
  "name": "The Weighing of the Idols",
  "puzzle_type": "Logic",
  "difficulty": "Easy",
  "description": "A small round vault holds a great bronze balance on a stone plinth. The left pan is empty. The right pan carries a sealed stone block stamped with the words \"Ten Hares\". Four carved idols stand in a row on a shelf: a hare, an owl, a bear and a stag. They are all the same grey stone, but the bear and the stag are clearly much larger than the hare.\n\nAround the plinth, three lines are chiselled into the floor: \"Two hares balance one owl.\" \"One owl and one hare balance one bear.\" \"One bear and one owl balance one stag.\"\n\nAn iron door on the far wall is held shut by a bar that lifts when the balance settles level.",
  "read_aloud": "A bronze balance stands in the middle of the vault, one pan weighed down by a block stamped with the words Ten Hares. Four stone animals wait on a shelf, and a few lines of reasoning are cut into the floor around them. The far door is barred, and the bar is tied to the beam of the scales.",
  "solution": "If a hare weighs 1, the floor lines give an owl 2, a bear 3 (owl + hare), and a stag 5 (bear + owl). The block weighs 10. The four idols total 11, so the only way to reach 10 is to leave out the hare: stag, bear and owl together on the left pan (5 + 3 + 2).\n\nIt is fair because the party can confirm every line by weighing idols against each other in the empty pan, and the arithmetic is small. Nothing needs to be guessed.",
  "hints": [
   {
    "order": 1,
    "text": "The floor lines tell you how the idols compare. Try them against each other on the empty pan to see that the lines are true."
   },
   {
    "order": 2,
    "text": "Treat the hare as one unit. How many units is each of the other idols?"
   },
   {
    "order": 3,
    "text": "The block weighs ten units. Add up all four idols and compare."
   },
   {
    "order": 4,
    "text": "All four idols total eleven. Leave out the hare."
   }
  ],
  "skill_checks": [
   {
    "skill": "Investigation",
    "dc": 10
   },
   {
    "skill": "Insight",
    "dc": 10
   }
  ],
  "success_outcome": "The beam settles level with a soft ring, the bar lifts, and the iron door swings inward. The idols stay on the pan; a small drawer in the plinth slides out holding the vault's modest treasure.",
  "failure_consequence": "A wrong load tips the beam hard and the scales fling the idols off the pan: each creature within 5 feet makes a DC 10 Dexterity saving throw or takes 1d4 bludgeoning damage. The bar locks for 1 minute, then the idols can be set back on the shelf and the puzzle tried again.",
  "tags": [
   "logic",
   "weights",
   "arithmetic",
   "beginner"
  ],
  "notes": "A good opener for new players. If the table has no head for sums, let them solve it by weighing: put two hares-worth against the owl and so on, and let the physical scale prove each line. Swap the idols for something that suits the dungeon (fish, crows, serpents). If the party wants a different target weight, change the block and re-check that the only fitting set is unique."
 },
 {
  "id": "grimoire_drowned_bell_chamber",
  "name": "The Drowned Bell Chamber",
  "puzzle_type": "Environmental",
  "difficulty": "Deadly",
  "description": "The party steps into a circular shaft 30 feet across and 30 feet high, its walls slick with old tide stains. The way back slams shut under a portcullis the moment the last creature crosses the threshold, and water begins to pour from carved fish mouths in the wall. It rises about 2 feet each round, so the chamber is full in 15 rounds.\n\nFive bronze bells hang on chains at different heights, one above the other in a loose spiral: the largest low on the wall, the smallest near the ceiling. Each is cast with a different wave pattern. A verse is cut above the sealed door: \"The sea gives back only what it is given, deepest voice first, rising as I rise.\"\n\nA large iron drain grate sits in the floor, choked by a heavy mechanism that clicks quietly each time a bell is struck.",
  "read_aloud": "The portcullis crashes down behind you and water gushes from the mouths of carved fish. Five bronze bells hang in a spiral on the walls, the biggest near the floor and the smallest near the roof. Above the sealed door, a verse says the sea gives back only what it is given, deepest voice first, rising as it rises.",
  "solution": "The bells must be struck from the lowest and deepest (largest) to the highest and brightest (smallest), matching the rising water. Each correct strike makes the floor mechanism click; after the fifth in order, the grate opens and the room drains over 3 rounds, and the portcullis lifts.\n\nA strike with a weapon, hand or thrown object is enough. A creature hears the pitch difference clearly in the air; once the water covers a bell, its note is dull and a creature must pass a DC 15 Wisdom (Perception) check to judge the pitch correctly, so players who think ahead should strike the low bells early. The verse and the visible bell sizes make the order discoverable without any check.",
  "hints": [
   {
    "order": 1,
    "text": "Strike a bell and listen. Do the bells sound the same?"
   },
   {
    "order": 2,
    "text": "The verse speaks of voices. A big bell and a small bell have different voices."
   },
   {
    "order": 3,
    "text": "The sea rises from the floor. So does the answer: begin where the water begins."
   },
   {
    "order": 4,
    "text": "Strike the largest, lowest bell first and finish with the smallest, highest one."
   }
  ],
  "skill_checks": [
   {
    "skill": "Perception",
    "dc": 15
   },
   {
    "skill": "Investigation",
    "dc": 15
   },
   {
    "skill": "Athletics",
    "dc": 15
   }
  ],
  "success_outcome": "The fifth bell rings clear, the drain grate drops away with a roar and the water spirals out of the floor. The portcullis lifts and a hidden shelf at the highest bell yields the chamber's treasure.",
  "failure_consequence": "Each wrong strike resets the mechanism and a surge raises the water by an extra 2 feet at once. Once the water is above a creature's head, it must swim (DC 12 Strength (Athletics) check each round to move, or tread in place) and can hold its breath for a number of minutes equal to 1 + its Constitution modifier (minimum 30 seconds). A creature that runs out of breath drops to 0 hit points the next round and starts dying. If the whole room is flooded and the order is still unsolved, the drain opens on its own after 2 minutes, flushing survivors into a cistern below for 2d6 bludgeoning damage.",
  "tags": [
   "environmental",
   "timed",
   "water",
   "bells",
   "deadly"
  ],
  "notes": "Run it in rounds and track the water level out loud. Keep a clear Deadly feeling but give outs: lower the portcullis with a combined DC 20 Strength check (two creatures may help), Water Breathing or similar magic changes the pacing, and a clever party may simply burst a bell loose to gain a hand hold. Remove the self-draining fail-safe if you want true lethality. For a lighter version, slow the water to 1 foot per round."
 },
 {
  "id": "grimoire_mosaic_floor",
  "name": "The Pilgrim's Mosaic",
  "puzzle_type": "Physical",
  "difficulty": "Medium",
  "description": "A square hall, 25 feet on a side, is paved entirely with five rows of five coloured tiles, each tile 5 feet across and inlaid with one of three symbols: a sun, a wave or a leaf. The party enters at the southern edge. A carved door stands closed in the middle of the northern wall.\n\nA frieze runs around the walls showing a pilgrim crossing the same floor. In every panel, the pilgrim's feet rest on a tile, and the panels repeat the same three symbols in the same order: sun, wave, leaf, sun, wave, leaf.\n\nThe tiles in the hall (south at the bottom, rows listed from north to south, columns west to east):\n\nRow 1: leaf, leaf, sun, wave, sun\nRow 2: wave, sun, leaf, sun, wave\nRow 3: leaf, sun, wave, leaf, sun\nRow 4: wave, leaf, sun, wave, leaf\nRow 5: sun, wave, leaf, sun, wave",
  "read_aloud": "Rows of coloured tiles stretch ahead of you to a closed door, each one marked with a sun, a wave or a leaf. Around the walls, a painted pilgrim crosses the same floor, one foot after another, and the panels repeat the same three signs in the same order.",
  "solution": "A safe route steps only onto tiles that follow the frieze order: sun, wave, leaf, then sun again, and so on, moving one tile at a time north, south, east or west (never diagonally). Start on a sun tile on the southern row. One valid path (columns A to E from the west): A5 sun, A4 wave, A3 leaf, B3 sun, C3 wave, C2 leaf, D2 sun, D1 wave, then the door. Another: A5 sun, B5 wave, C5 leaf, D5 sun, D4 wave, D3 leaf, D2 sun, D1 wave.\n\nThe rule is shown, not guessed, because the frieze repeats it in every panel. Players may map it out on paper, and several routes work.",
  "hints": [
   {
    "order": 1,
    "text": "Study the frieze. What does the pilgrim's foot touch in each panel?"
   },
   {
    "order": 2,
    "text": "The pilgrim's tiles always go sun, wave, leaf, then back to sun."
   },
   {
    "order": 3,
    "text": "Move one tile at a time, in a straight line, never across a corner."
   },
   {
    "order": 4,
    "text": "Start on a sun tile at the southern edge and follow the order. If the next step is not the next symbol, it is the wrong step."
   }
  ],
  "skill_checks": [
   {
    "skill": "Investigation",
    "dc": 13
   },
   {
    "skill": "Perception",
    "dc": 12
   },
   {
    "skill": "Acrobatics",
    "dc": 13
   }
  ],
  "success_outcome": "The last wave tile glows, the northern door slides sideways and the tiles on either side of the safe path settle back to rest. Anyone left in the hall may now walk straight across.",
  "failure_consequence": "A wrong tile drops away into a 10-foot pit lined with blunt stone teeth. The creature on it makes a DC 13 Dexterity saving throw; on a failure it falls and takes 1d6 bludgeoning damage, and on a success it catches the edge and is only knocked prone on its own previous tile. The tile resets after 1 minute, and the climb out is DC 10 Strength (Athletics).",
  "tags": [
   "physical",
   "trap",
   "pattern",
   "movement"
  ],
  "notes": "Hand the players a drawn grid if they ask to map it. To make it harder, add a second symbol (such as a moon) and lengthen the cycle, or require the full party to cross within a fixed number of rounds. To make it easier, light the safe tiles faintly for a creature with darkvision or Detect Magic. Remember a flying or levitating party can skip the floor entirely: the door stays locked until someone steps on the final tile."
 },
 {
  "id": "grimoire_honest_gargoyle",
  "name": "The Honest Gargoyle",
  "puzzle_type": "Social",
  "difficulty": "Medium",
  "description": "At the end of a narrow gallery, a stone gargoyle crouches on a plinth before a sealed bronze door. Its chest rises slowly like a sleeper's. When anyone speaks, one eye opens.\n\nThe gargoyle was set here to keep the door against liars, and it was sworn to speak only true words itself. It asks plain questions: who are you, why have you come, and what do you mean to do beyond the door. It listens carefully and it can tell when it is being lied to, but silence, evasion and unspoken thoughts are not lies in its eyes. It cannot tell a falsehood, so it also cannot recognise a joke or a bluff.\n\nThe gargoyle is tired of being asked riddles and menaced by thieves. It would like someone to ask about it, and it is happy to answer any question truthfully, though it will not open the door for someone it has caught in a lie.",
  "read_aloud": "A gargoyle sits like a sleeping cat before a bronze door. One stone eye slides open as you approach. \"I do not lie,\" it says in a voice like gravel. \"And I do not open for those who do. Who are you, and why have you come?\"",
  "solution": "The party passes by telling only true words. They may choose what to say, and they may stay silent about things they do not want to share, but any outright lie makes the gargoyle refuse to open the door and sound the alarm. Honest answers about their purpose (even if unflattering) satisfy it.\n\nIt also warms to genuine interest: any character who asks it about itself, its long watch or the door, and who listens, earns a favourable disposition, and it will willingly open the door for those it likes. A clever party can also make a truthful bargain: promise, honestly, to tell it what lies beyond when they return. It will insist on keeping the promise.",
  "hints": [
   {
    "order": 1,
    "text": "The gargoyle asks questions. Does it ever ask for more than the truth?"
   },
   {
    "order": 2,
    "text": "It says it will not open for liars. Does it say anything about those who stay quiet?"
   },
   {
    "order": 3,
    "text": "The gargoyle has been alone for a very long time. What has nobody asked it?"
   },
   {
    "order": 4,
    "text": "Tell it the truth, or ask it about itself, and listen to the answer."
   }
  ],
  "skill_checks": [
   {
    "skill": "Persuasion",
    "dc": 14
   },
   {
    "skill": "Insight",
    "dc": 13
   },
   {
    "skill": "History",
    "dc": 15
   }
  ],
  "success_outcome": "The gargoyle grinds aside, the bronze door unseals, and the creature adds, in a gentler voice, that it will remember the honest. It can offer a direction or a warning about the chamber beyond.",
  "failure_consequence": "If any member of the party lies in its hearing, the gargoyle rises and shouts that a liar has come. Two statues in side alcoves wake as gargoyles (Monster Manual, gargoyle) and attack. The door stays barred for 1 hour. The gargoyles stop fighting if the party leaves the gallery or surrenders, and the original gargoyle will talk again once the liar apologises truthfully.",
  "tags": [
   "social",
   "roleplay",
   "guardian",
   "truth"
  ],
  "notes": "Play it as a real conversation. Do not penalise a player for choosing what not to say; reward cleverness with truth. Spells such as Charm Person or Zone of Truth interact with the gargoyle's code, and an obvious falsehood told as theatre (for example in a play) counts as a lie to it. If the table is stuck, have the gargoyle volunteer a question about their journey. Scale the failure by adding or removing gargoyles."
 },
 {
  "id": "grimoire_lever_bank_cipher",
  "name": "The Lever Bank Cipher",
  "puzzle_type": "Logic",
  "difficulty": "Hard",
  "description": "A narrow vault holds a row of six iron levers set in a stone bench, each able to be thrown up or down. A heavy brass handle at the centre of the bench is the master lever. Above the bench, six lines of unfamiliar-looking text are etched into the wall. Beneath them is a short line: \"THE SUN WALKS THREE STEPS.\"\n\nThe etched lines read:\n\n1. HADFWOB WKUHH OHYHUV KDQJ GRZQ\n2. WKH VHFRQG DQG WKH WKLUG DJUHH\n3. WKH ILUVW GLVDJUHHV ZLWK WKH VHFRQG\n4. WKH IRXUWK SRLQWV XS\n5. WKH ILIWK GLVDJUHHV ZLWK WKH IRXUWK\n6. WKH VLAWK DJUHHV ZLWK WKH IRXUWK\n\nAll six levers begin in the up position. A small panel beside the bench shows a tally of failed attempts.",
  "read_aloud": "Six iron levers stand in a row on a stone bench, with a heavy brass handle beside them. Above, six lines of strange letters are carved into the wall, and beneath them a single line in the same tongue: THE SUN WALKS THREE STEPS.",
  "solution": "The text is a Caesar cipher, each letter shifted three places forward in the alphabet. The line under the lines says so: the sun (A, the first letter) walks three steps, and so each letter must be moved three steps back to read it. Decoded:\n\n1. EXACTLY THREE LEVERS HANG DOWN\n2. THE SECOND AND THE THIRD AGREE\n3. THE FIRST DISAGREES WITH THE SECOND\n4. THE FOURTH POINTS UP\n5. THE FIFTH DISAGREES WITH THE FOURTH\n6. THE SIXTH AGREES WITH THE FOURTH\n\nSolve: lever 4 is up. Lever 5 disagrees with it, so it is down. Lever 6 agrees with lever 4, so it is up. Levers 2 and 3 agree, and lever 1 disagrees with lever 2. If 2 and 3 are up, lever 1 is down and the total of downs is two (levers 1 and 5), which breaks line 1. So 2 and 3 are down and lever 1 is up. Final: levers 2, 3 and 5 down; levers 1, 4 and 6 up. Then pull the master handle.",
  "hints": [
   {
    "order": 1,
    "text": "The letters are real words in disguise. The line beneath tells you how they were shifted."
   },
   {
    "order": 2,
    "text": "The sun is the first of the letters. It walks three steps. Walk each letter back three to read it."
   },
   {
    "order": 3,
    "text": "Once the lines are readable, they describe the levers in terms of each other. Start with the one that states a position outright."
   },
   {
    "order": 4,
    "text": "Lever 4 is up. Work out lever 5 and lever 6 from it, then count how many are down."
   }
  ],
  "skill_checks": [
   {
    "skill": "Investigation",
    "dc": 15
   },
   {
    "skill": "Arcana",
    "dc": 15
   },
   {
    "skill": "History",
    "dc": 13
   }
  ],
  "success_outcome": "The master handle sinks smoothly. A section of the vault's far wall retracts, and the levers lock in place. The party also gets a brass tag recording the working of the cipher, in case it shows up again deeper in the dungeon.",
  "failure_consequence": "A wrong setting arcs lightning through the bench when the master handle is thrown: each creature touching a lever makes a DC 14 Dexterity saving throw, taking 3d6 lightning damage on a failure or half as much on a success. The levers lock for 1 minute and reset. Three failures in a row cause the vault to flood with harmless but loud sparks for an hour, which wakes nearby sleeping creatures.",
  "tags": [
   "logic",
   "cipher",
   "levers",
   "deduction",
   "puzzle"
  ],
  "notes": "Print the cipher text for the players. The pattern is a simple shift of three, but the surrounding line is the only clue: if the table does not catch it, a DC 15 Intelligence (History) check recalls that old guilds used such shifts. If you want to reuse the vault, move the answer by rewriting the six lines and re-checking by brute force that only one arrangement fits."
 },
 {
  "id": "grimoire_sundial_door",
  "name": "The Sundial Door",
  "puzzle_type": "Environmental",
  "difficulty": "Medium",
  "description": "A deep hall with no windows ends in a great stone door whose face is carved as a sundial. Eight runes ring the door in a circle, one for each compass point. A bronze gnomon, a tall vertical spike, stands on the floor before the door at the centre of a ring of eight wall sconces, each facing inward and aligned with one of the compass points.\n\nOn the wall above the sconces, a mural shows a village at dusk. The sun is setting behind a high mountain; a long shadow of a house stretches across the fields. The line beneath says: \"Let the door see evening.\"\n\nAll the sconces are empty. A small stack of oil-soaked kindling and a flint sits on a nearby shelf. The runes on the door do not move.",
  "read_aloud": "The door at the end of the hall is carved as a great sundial, ringed with eight runes. A bronze spike rises from the floor before it, surrounded by eight empty sconces set in the walls. A mural above shows a village at dusk, the sun low behind a mountain and long shadows reaching across the fields.",
  "solution": "A shadow always falls opposite the light. In the mural the sun sets in the west, and the shadows point east. The door must see evening, so a single light must stand in the western sconce, which throws the gnomon's shadow east onto the east rune. The door is aligned so that the east rune matches the mural's shadow.\n\nOnly one source of light may burn: with two, the gnomon casts two shadows and the door ignores both. A torch, a lantern, a Light cantrip or any other point of light works. The party must put out the others or cover them.",
  "hints": [
   {
    "order": 1,
    "text": "The hall has no sun. What is the mural trying to tell you about the time of day?"
   },
   {
    "order": 2,
    "text": "Where does the sun stand in the mural, and where do the shadows fall?"
   },
   {
    "order": 3,
    "text": "A shadow falls opposite the light. To put a shadow on the east, where must the light be?"
   },
   {
    "order": 4,
    "text": "Put exactly one light in the western sconce and put out every other flame."
   }
  ],
  "skill_checks": [
   {
    "skill": "Survival",
    "dc": 12
   },
   {
    "skill": "Investigation",
    "dc": 13
   },
   {
    "skill": "Perception",
    "dc": 13
   }
  ],
  "success_outcome": "The gnomon's shadow touches the east rune, which glows gold. The whole door rolls aside like a cart wheel, revealing a dry chamber beyond.",
  "failure_consequence": "If the shadow falls on the wrong rune, the gnomon heats and a jet of flame spurts from its tip. Each creature within 10 feet of it makes a DC 12 Dexterity saving throw, taking 2d6 fire damage on a failure or half as much on a success. The sconces go dark and the oil can be relit after 1 minute.",
  "tags": [
   "environmental",
   "light",
   "shadow",
   "directions"
  ],
  "notes": "Describe the mural vividly. If the table gets lost with compass points, give them the shorthand that the hall faces north, so west is to the left on entering. A table that likes physical puzzles can use a real torch and a hand shadow at the table. If a party brings daylight or Daylight spell, the gnomon is triggered by its source direction, so place the light carefully. A party that can disable the sconces by force still has to wait for the flame to reset."
 },
 {
  "id": "grimoire_silent_choir",
  "name": "The Silent Choir",
  "puzzle_type": "Arcane",
  "difficulty": "Hard",
  "description": "A long vaulted hall is lined with seven robed stone singers, each in a different colour of glass-flecked robe: red, orange, yellow, green, blue, indigo and violet. Their mouths are open as if in song, but no sound comes from them, nor from the party: the whole hall is under a permanent Silence effect (a 40-foot-radius sphere of magical silence, as the spell). Spellcasting with verbal components fails inside it.\n\nAt the end of the hall, a stone lectern holds an open hymn book. Its lyric is written plainly:\n\n\"Green hills wake, Red sparks fall, Blue tides turn, Blue shadows stay, Violet bells ring, Yellow lanterns burn.\"\n\nIn the middle of the hall stands a plinth bearing a clear crystal. When a creature touches a singer, the singer's gem eyes flicker with a coloured light, then fade. A ward on the plinth keeps the crystal shut.",
  "read_aloud": "Seven stone singers stand in two rows down a vaulted hall, each in a different coloured robe, mouths open in a song you cannot hear. The silence is so complete that you can feel your own voice stolen. At the far end, an open book rests on a lectern, and a clear crystal glints on a plinth in the middle of the floor.",
  "solution": "The lyric is the song, and its first words are the colours. The singers must be touched in this order: green, red, blue, blue, violet, yellow. Blue is touched twice in a row, which a careless table might skip. Each correct touch makes the singer's eyes flare in the matching colour.\n\nThe hall's silence means there is no sound to follow, so the answer must come from the book. A creature that studies the singers with Detect Magic or a DC 15 Intelligence (Arcana) check recognises that the crystal responds to colour rather than sound. When the sixth singer is touched, the ward on the plinth lifts.",
  "hints": [
   {
    "order": 1,
    "text": "There is no sound here. What else could carry a song?"
   },
   {
    "order": 2,
    "text": "The hymn book is the only thing that speaks. Read the first word of each line."
   },
   {
    "order": 3,
    "text": "The words name the singers' robes. They are in order."
   },
   {
    "order": 4,
    "text": "Touch the singers: green, red, blue, blue, violet, yellow."
   }
  ],
  "skill_checks": [
   {
    "skill": "Arcana",
    "dc": 15
   },
   {
    "skill": "Investigation",
    "dc": 15
   },
   {
    "skill": "History",
    "dc": 14
   }
  ],
  "success_outcome": "The six eyes shine together, the ward breaks and the crystal opens, revealing a stored charm or a narrow key kept in a velvet pocket. The silence lifts for one round before returning.",
  "failure_consequence": "A wrong touch breaks the silence with a concussive shriek: each creature in the hall makes a DC 15 Constitution saving throw, taking 3d8 thunder damage on a failure or half as much on a success, and the sound carries 100 feet beyond the hall. The singers reset and fall silent again.",
  "tags": [
   "arcane",
   "music",
   "colours",
   "silence",
   "sequence"
  ],
  "notes": "Print the hymn as a handout. A character who thinks to use Message or other silent magic can coordinate across the hall. If the table is stuck, let a wizard's Detect Magic reveal that the singers' glass flecks each radiate faint evocation magic of their own colour. To increase difficulty, drop the lyric and let the party infer the order from a mural showing a choir. To lower it, soften the thunder damage to 2d8."
 },
 {
  "id": "grimoire_gallery_of_wardens",
  "name": "The Gallery of Wardens",
  "puzzle_type": "Arcane",
  "difficulty": "Medium",
  "description": "A long, dim gallery displays six framed portraits of stern figures called the Wardens, each holding a different object: a candle, a key, a pair of scales, a book, a sword and a bell. Beneath each is a brass nameplate. The sixth painting at the far end has a narrow door behind it, and the door is locked. The gallery is lit by candles in wall sconces.\n\nWhen the party first enters, the candlelight is steady and the Wardens' faces are plain. Halfway down the gallery, a pressure plate under the carpet snuffs the candles one at a time over a count of a few seconds, plunging the room into near darkness. When the candles relight, exactly one portrait has changed: the Warden of Keys, who first held a closed fist at her chest, now holds her hand out, palm open, and a painted key rests in it.\n\nThe frame of that portrait has a hollow base that does not show from the front.",
  "read_aloud": "Six painted Wardens glare down from tall frames, each clutching a candle, a key, a pair of scales, a book, a sword or a bell. The one with the key holds only a closed fist. Candles burn along the wall and the carpet muffles your footsteps.",
  "solution": "The portrait that changes is the Warden of Keys. Once the lights flicker out and return, her hand opens and shows a painted key. Pressing the painted key (a small raised section of oil paint) pops open the hollow base of her frame, which contains the real key to the locked door. Any other portrait that is tampered with does not open anything.\n\nThe puzzle is fair because the party can record the details on first entry and compare after the lights return. A character with Detect Magic or Arcana senses the key portrait's aura of illusion.",
  "hints": [
   {
    "order": 1,
    "text": "Write down what each painting shows before anything happens."
   },
   {
    "order": 2,
    "text": "Something in the gallery changes when the light changes. Compare it with your notes."
   },
   {
    "order": 3,
    "text": "One painting's hand is different from before. What is it offering?"
   },
   {
    "order": 4,
    "text": "Press the painted key in the Warden of Keys' open hand, and look in the frame's base."
   }
  ],
  "skill_checks": [
   {
    "skill": "Perception",
    "dc": 14
   },
   {
    "skill": "Arcana",
    "dc": 13
   },
   {
    "skill": "Investigation",
    "dc": 15
   }
  ],
  "success_outcome": "The base of the frame clicks open and a real iron key slides out. The Warden of Keys settles back into a quiet pose, and the narrow door behind the sixth portrait unlocks.",
  "failure_consequence": "Disturbing the wrong portrait makes the sitter weep black ink from the canvas. Each creature within 5 feet of that frame makes a DC 13 Constitution saving throw, taking 2d6 necrotic damage and being blinded until the end of its next turn on a failure, or half damage and no blindness on a success. The paintings freeze and the puzzle does not reset until the candles relight.",
  "tags": [
   "arcane",
   "observation",
   "paintings",
   "illusion"
  ],
  "notes": "Give the players a sheet describing the six paintings so they can compare. If the table is stuck, have the candles flicker a second time to prompt a re-check. You can swap the changed portrait for any of the six; keep the rule that the changed painting is the one that shows what is needed. A light source brought from outside does not stop the change; the relight is the signal, not the darkness."
 },
 {
  "id": "grimoire_riddle_keeper",
  "name": "The Riddle-Keeper's Toll",
  "puzzle_type": "Social",
  "difficulty": "Hard",
  "description": "In a stone alcove behind a narrow bridge sits a hooded figure made of brass plates and old rope, called the Riddle-Keeper. Behind it, a door is carved with three empty slots. It talks politely and in riddles, and it is bound to trade: it will pose three riddles to the party, and the party may pose riddles in return.\n\nIf the party answers two of its three riddles correctly, it grants passage. If the party stumps it with a riddle it cannot answer, it must also grant passage, and it respects the bargain grudgingly. It has been waiting a long time and has heard every common riddle in the world, so a stale one will not trouble it.\n\nThe Riddle-Keeper's riddles:\n\n1. \"I speak without a mouth and answer when you call. I die when you stop shouting at walls.\" (an echo)\n\n2. \"I stretch at dusk, I shrink at noon, I vanish in the dark, and I follow you faithfully. I carry no weight.\" (a shadow)\n\n3. \"Say my name and I am gone.\" (silence)",
  "read_aloud": "A figure of brass plates and rope sits beneath a hood, a closed door at its back. \"I am the Riddle-Keeper,\" it says, \"and I keep a toll. Three questions I give, two answers I need. Or give me one I cannot answer, and the door is yours.\"",
  "solution": "The party answers at least two of the three riddles: echo, shadow, silence. Or they pose a riddle the Riddle-Keeper cannot answer. A good fair option is a paradox or a question whose true answer is unknowable to it, such as \"What question can you never answer with yes?\" (answer: \"Are you asleep?\"), or one grounded in the party's own journey, which it has not seen. The keeper must honour any riddle with a true answer; a riddle with no answer is a cheat and does not count.\n\nIt is fair because each riddle is gettable with a DC 10 check on the right skill or by thought alone, and the table has several chances.",
  "hints": [
   {
    "order": 1,
    "text": "The Riddle-Keeper needs two of three, so one wrong answer is survivable."
   },
   {
    "order": 2,
    "text": "Think about what exists but has no body: sounds, shapes, absences."
   },
   {
    "order": 3,
    "text": "If the table is stuck, ask what the keeper cannot know, and remember that it has never met the party."
   },
   {
    "order": 4,
    "text": "The answers are an echo, a shadow and silence. A riddle the keeper cannot solve also wins."
   }
  ],
  "skill_checks": [
   {
    "skill": "Insight",
    "dc": 15
   },
   {
    "skill": "History",
    "dc": 14
   },
   {
    "skill": "Persuasion",
    "dc": 15
   }
  ],
  "success_outcome": "The three slots on the door fill with faint light, and it swings open. The Riddle-Keeper bows and offers one last riddle as a parting gift, whose answer points to a secret ahead.",
  "failure_consequence": "Each wrong answer is a strike: the character who answered makes a DC 14 Intelligence saving throw, taking 2d6 psychic damage and being unable to answer the next riddle on a failure, or half damage on a success. After three strikes the keeper stops talking, seals the door for 1 hour and keeps a small personal item from the party as a pledge, which the party can reclaim by returning with a new answer.",
  "tags": [
   "social",
   "riddles",
   "negotiation",
   "guardian"
  ],
  "notes": "Replace the riddles with ones that suit your table or setting. Let the players use their own riddles and judge fairly whether the keeper could answer. If you want a lighter version, make the damage a penalty to a later check. Never let a player brute-force the keeper by asking for help on a wrong answer; the keeper remarks coldly on any attempt to cheat."
 }
]$content$::jsonb)
on conflict (id) do nothing;

-- ── library_roll_tables (2) ─────────────────────────────────────────
insert into public.library_roll_tables (id, name, description, dice, entries, tags, notes)
select id, name, description, dice, entries, tags, notes
  from jsonb_populate_recordset(null::public.library_roll_tables, $content$[
 {
  "id": "grimoire_dungeon_wandering_levels_1_2",
  "name": "Dungeon Wandering (Levels 1-2)",
  "description": "Low-level dungeon patrols and scavengers. Roll once per hour the party lingers.",
  "dice": "1d8",
  "entries": [
   {
    "min": 1,
    "max": 1,
    "label": "1d4 Giant Rats",
    "notes": "Squeezing through a crack in the wall."
   },
   {
    "min": 2,
    "max": 3,
    "label": "2 Kobolds on patrol",
    "notes": "Lightly armoured, retreat at half HP."
   },
   {
    "min": 4,
    "max": 4,
    "label": "1d4 Giant Centipedes",
    "notes": "Climbing the ceiling, drop on first failed Stealth."
   },
   {
    "min": 5,
    "max": 5,
    "label": "Goblin scouting party (1d4 + 1)",
    "notes": "One carries a lantern."
   },
   {
    "min": 6,
    "max": 6,
    "label": "Lone wandering Stirge",
    "notes": "Hungry. Surprises on a 1 to 3."
   },
   {
    "min": 7,
    "max": 7,
    "label": "Distant howl, cold draft",
    "notes": "No combat, but morale check next encounter."
   },
   {
    "min": 8,
    "max": 8,
    "label": "Shrieker patch ahead",
    "notes": "Triggers if party moves in light."
   }
  ],
  "tags": [
   "dungeon",
   "low-level"
  ],
  "notes": "Suggested check: every 2 hours of in-dungeon downtime."
 },
 {
  "id": "grimoire_forest_road_by_day",
  "name": "Forest Road by Day",
  "description": "Travel encounter for a well-trodden forest road. Roll on each watch.",
  "dice": "1d12",
  "entries": [
   {
    "min": 1,
    "max": 2,
    "label": "Travelling merchant cart",
    "notes": "Friendly. May trade."
   },
   {
    "min": 3,
    "max": 4,
    "label": "Pilgrim group (1d6)",
    "notes": "Heading to a nearby shrine."
   },
   {
    "min": 5,
    "max": 5,
    "label": "Highway bandits (1d4 + 2)",
    "notes": "Demand a toll. Disengage at half."
   },
   {
    "min": 6,
    "max": 6,
    "label": "Wolf pack (1d6)",
    "notes": "Will not attack a strong-looking party."
   },
   {
    "min": 7,
    "max": 7,
    "label": "Wounded courier",
    "notes": "Pursued by something off the road. Quest hook."
   },
   {
    "min": 8,
    "max": 8,
    "label": "Druid + animal companion",
    "notes": "Distracted, may share local rumours."
   },
   {
    "min": 9,
    "max": 9,
    "label": "Owlbear hunting",
    "notes": "Crashing through the underbrush."
   },
   {
    "min": 10,
    "max": 10,
    "label": "Cart wreck",
    "notes": "1 day old. Tracks lead off-road."
   },
   {
    "min": 11,
    "max": 11,
    "label": "Lone ranger",
    "notes": "Friendly, asks for news."
   },
   {
    "min": 12,
    "max": 12,
    "label": "No encounter",
    "notes": "Pleasant uneventful stretch."
   }
  ],
  "tags": [
   "wilderness",
   "travel"
  ],
  "notes": "Suggested check: every full day of overland travel."
 }
]$content$::jsonb)
on conflict (id) do nothing;
