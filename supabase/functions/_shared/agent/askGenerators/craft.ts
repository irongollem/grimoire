// Ask Grimoire: Dungeon Craft and quests: encounters, tables, features, traps, puzzles, quest hooks.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";
import { image } from "./shared.ts";

export const CRAFT_GENERATORS: readonly AskGenerator[] = [
  {
    id: "encounter", action: "Create encounter", noun: "encounter", ending: "record", fiveE: true,
    describe: "A combat encounter with monsters balanced for the party. It can be set in an existing place (`location_id`), where the Atlas then lists it.",
    inputs: {
      difficulty: { type: "string", description: "How hard.", enum: ["auto", "easy", "medium", "hard", "deadly"], label: "Difficulty" },
      location_id: { type: "string", description: "Id of a place in this campaign where the fight happens.", label: "Where", record: "location", placeholder: "Nowhere in particular", aside: "encounter_where" },
      time_of_day: { type: "string", description: "The hour the fight happens, when the place lies in a habitat: species that rest then are met less often.", enum: ["any", "dawn", "day", "dusk", "night"], label: "Time of day", optionLabels: { any: "Any time", dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" } },
    },
    opened: { time_of_day: "any" },
    concept: { label: "What to make", placeholder: "Goblin ambush on the forest road, levels 3–5, a betrayal mid-fight…", required: true, max: 500 },
    ask: ["difficulty"],
  },
  {
    id: "roll_table", action: "Create roll table", noun: "roll table", ending: "record",
    describe: "A random table to roll on.",
    inputs: {
      die: { type: "string", description: "The die the table is rolled on.", enum: ["1d6", "1d8", "1d10", "1d12", "1d20"], label: "Die" },
    },
    opened: { die: "1d8" },
    concept: { label: "What to make", placeholder: "Forest road at night, bandits active in the region, levels 3–5…", required: true, max: 500 },
  },
  {
    id: "loot_table", action: "Create loot table", noun: "loot table", ending: "record", fiveE: true,
    describe: "A treasure table for a challenge tier.",
    inputs: {
      cr_tier: { type: "string", description: "Challenge tier the loot suits.", enum: ["any", "0-4", "5-10", "11-16", "17+"], label: "Tier", hint: "Filters which items the AI is offered", optionLabels: { any: "Any tier", "0-4": "CR 0–4", "5-10": "CR 5–10", "11-16": "CR 11–16", "17+": "CR 17+" } },
      skip_attunement: { type: "boolean", description: "Leave out items that need attunement.", label: "Skip items that need attunement" },
    },
    opened: { cr_tier: "5-10" },
    concept: { label: "What to make", placeholder: "The smugglers' vault beneath the Rusty Anchor: coin, contraband, one thing they stole and couldn't sell…", required: true, max: 500 },
  },
  {
    id: "dungeon_feature", action: "Create dungeon feature", noun: "feature", ending: "record", fiveE: true,
    describe: "A dungeon feature: a fountain, altar, strange door.",
    inputs: {
      feature_type: { type: "string", description: "Kind of feature.", label: "Feature type", list: "dungeon_feature_type" },
      trigger_type: { type: "string", description: "What sets it off.", label: "Trigger", list: "dungeon_feature_trigger" },
      image: { ...image, label: "Illustration" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A bookcase in the abbot's study that swings aside when the wrong tome is pulled, revealing a stair down to the old crypt, and a needle trap for anyone who guesses wrong…", required: true, max: 1000 },
  },
  {
    id: "trap", action: "Create trap", noun: "trap", ending: "record", fiveE: true,
    describe: "A trap with its trigger, effect and countermeasures.",
    inputs: {
      trap_type: { type: "string", description: "Kind of trap.", enum: ["mechanical", "magical", "hybrid", "environmental"], label: "Type" },
      cr: { type: "string", description: "Challenge rating, e.g. \"1/2\" or \"5\".", label: "Challenge rating", list: "trap_cr" },
      image: { ...image, label: "Trap illustration" },
      party_in_picture: { type: "boolean", description: "Show the adventuring party from the campaign's group portrait in the illustration. Only when the DM asked for it.", label: "The party in the picture", hint: "You accept the likeness notice when it starts", available: "group_portrait", when: { key: "image" } },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A pressure plate in a dungeon corridor that triggers a volley of poisoned darts from hidden alcoves in the walls…", required: true, max: 1000 },
  },
  {
    id: "puzzle", action: "Create puzzle", noun: "puzzle", ending: "record",
    describe: "A puzzle room or riddle.",
    inputs: {
      puzzle_type: { type: "string", description: "Kind of puzzle.", enum: ["logic", "physical", "arcane", "social", "environmental"], label: "Type" },
      difficulty: { type: "string", description: "How hard.", enum: ["trivial", "easy", "medium", "hard", "deadly"], label: "Difficulty" },
      image: { ...image, label: "Room illustration" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A flooded crypt where water levels rise unless the players reroute flow through a series of ancient stone sluices…", required: true, max: 1000 },
  },
  {
    id: "quest_hooks", action: "Suggest quest hooks", noun: "quest", ending: "record",
    createAction: "Done",
    describe: "Five quest hooks to pick one from and build.",
    inputs: {
      quest_giver_id: { type: "string", description: "Id of an NPC who gives it.", label: "Quest giver", record: "npc", aside: "party_level" },
      location_id: { type: "string", description: "Id of the place it starts.", label: "Location", record: "location" },
    },
    concept: { label: "Theme", placeholder: "A dragon cult terrorising trade routes along the northern pass…", max: 500 },
  },
];
