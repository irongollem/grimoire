// Ask Grimoire: Dungeon Craft and quests: encounters, tables, features, traps, puzzles, quest hooks.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";
import { image } from "./shared.ts";

export const CRAFT_GENERATORS: readonly AskGenerator[] = [
  {
    id: "encounter", action: "Create encounter", noun: "encounter", ending: "record", fiveE: true,
    describe: "A combat encounter with monsters balanced for the party. It can be set in an existing place (`location_id`), where the Atlas then lists it.",
    inputs: {
      difficulty: { type: "string", description: "How hard.", enum: ["auto", "easy", "medium", "hard", "deadly"] },
      location_id: { type: "string", description: "Id of a place in this campaign where the fight happens." },
    },
    ask: ["difficulty"],
  },
  { id: "roll_table", action: "Create roll table", noun: "roll table", ending: "record", describe: "A random table to roll on.", inputs: { die: { type: "integer", description: "Faces of the die, e.g. 6, 20, 100.", minimum: 2, maximum: 100 } } },
  { id: "loot_table", action: "Create loot table", noun: "loot table", ending: "record", fiveE: true, describe: "A treasure table for a challenge tier.", inputs: { cr_tier: { type: "string", description: "Challenge tier the loot suits." } } },
  { id: "dungeon_feature", action: "Create dungeon feature", noun: "feature", ending: "record", fiveE: true, describe: "A dungeon feature: a fountain, altar, strange door.", inputs: { feature_type: { type: "string", description: "Kind of feature." }, image } },
  { id: "trap", action: "Create trap", noun: "trap", ending: "record", fiveE: true, describe: "A trap with its trigger, effect and countermeasures.", inputs: { trap_type: { type: "string", description: "Kind of trap." }, image } },
  { id: "puzzle", action: "Create puzzle", noun: "puzzle", ending: "record", describe: "A puzzle room or riddle.", inputs: { puzzle_type: { type: "string", description: "Kind of puzzle." }, difficulty: { type: "string", description: "How hard." }, image } },
  { id: "quest_hooks", action: "Suggest quest hooks", noun: "quest", ending: "review", describe: "Five quest hooks to pick one from and build.", inputs: { quest_giver_id: { type: "string", description: "Id of an NPC who gives it." }, location_id: { type: "string", description: "Id of the place it starts." } } },
];
