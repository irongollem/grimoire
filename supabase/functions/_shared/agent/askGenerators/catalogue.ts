// Ask Grimoire: Generators that make a catalogue record: creatures, items, spells, places, factions, gods, codex entries, rules, recipes.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";
import { linksFor, image } from "./shared.ts";

export const CATALOGUE_GENERATORS: readonly AskGenerator[] = [
  {
    id: "monster", action: "Create monster", noun: "monster", ending: "record", fiveE: true,
    describe: "A new monster with a full stat block.",
    inputs: {
      challenge_rating: { type: "string", description: "Challenge rating, e.g. \"1/2\" or \"7\".", label: "Challenge rating", placeholder: "e.g. 5, 1/2, 1/4" },
      monster_type: { type: "string", description: "Creature type, e.g. beast, undead, fiend.", label: "Type", list: "monster_type" },
      size: { type: "string", description: "Size.", enum: ["tiny", "small", "medium", "large", "huge", "gargantuan"], label: "Size" },
      image: { ...image, label: "Portrait art" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A colossal spider deity that dwells in the Underdark, commanding its cultists through webs of illusion and dreams…", required: true, max: 1000 },
    ask: ["challenge_rating", "image"],
  },
  {
    id: "item", action: "Create item", noun: "item", ending: "record", fiveE: true,
    describe: "A new item: magic item, weapon, armour, potion, trinket.",
    inputs: {
      item_type: { type: "string", description: "Kind of item.", label: "Item type", list: "item_type" },
      rarity: { type: "string", description: "Rarity.", enum: ["mundane", "common", "uncommon", "rare", "very_rare", "legendary", "artifact"], label: "Rarity", optionLabels: { very_rare: "Very rare" } },
      cursed: { type: "boolean", description: "Carries a curse.", label: "Make it cursed", hint: "The AI chooses the curse" },
      links: linksFor("item", "its owner, the place it lies in, the faction that guards it, the god it is sacred to"),
      image: { ...image, label: "Item art" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A staff carved from petrified dragon bone, crackling with lightning and able to call storms when wielded by a chosen champion…", required: true, max: 1000, mentions: "items" },
    ask: ["image"],
  },
  {
    id: "spell", action: "Create spell", noun: "spell", ending: "record", fiveE: true,
    describe: "A new spell.",
    inputs: {
      level: { type: "string", description: "Spell level as a digit, \"0\" for a cantrip.", enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], label: "Level", optionLabels: { "0": "Cantrip", "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th", "6": "6th", "7": "7th", "8": "8th", "9": "9th" } },
      school: { type: "string", description: "School of magic.", label: "School", list: "spell_school" },
      image: { ...image, label: "Spell-effect art" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A storm of luminous moths that swarm a target, biting and dazzling them with flashes of bioluminescence…", required: true, max: 1000 },
    ask: ["level", "image"],
  },
  {
    id: "faction", action: "Create faction", noun: "faction", ending: "record",
    describe: "A new faction, guild, cult or organisation, with a leader. An existing NPC can lead it (`leader_npc_id`) and an existing place can be its headquarters (`headquarters_id`).",
    inputs: {
      faction_type: { type: "string", description: "Kind of organisation.", label: "Type", list: "faction_type" },
      alignment: { type: "string", description: "Alignment.", label: "Alignment", list: "alignment" },
      leader_npc_id: { type: "string", description: "Id of an existing NPC in this campaign who leads it. They are added as its Leader.", label: "Leader", record: "npc", group: "Who leads it, where" },
      leader_name: { type: "string", description: "The leader's name when they are not an existing NPC, if the DM gave one.", label: "Or a new leader", placeholder: "A name, when they are not an NPC yet", group: "Who leads it, where" },
      headquarters_id: { type: "string", description: "Id of an existing place in this campaign where it is based. It is linked as its headquarters.", label: "Headquarters", record: "location", group: "Who leads it, where" },
      headquarters_name: { type: "string", description: "Where it is based when that place does not exist yet.", label: "Or a new place", placeholder: "A name, when the place is not in your Atlas yet", group: "Who leads it, where" },
      links: { ...linksFor("faction", "a place they hold, a god they serve, a rival faction, an NPC who works for them"), group: "Who leads it, where" },
      image: { ...image, label: "Faction emblem" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A shadowy thieves' guild operating beneath the city's merchant quarter, secretly manipulating trade routes and bribing officials to maintain their monopoly on smuggled goods…", required: true, max: 1000 },
    ask: ["image"],
  },
  {
    id: "location", action: "Create place", noun: "place", ending: "record",
    describe: "A new place in the Atlas: a town, building, region, dungeon. It can sit inside an existing place (`parent_id`) and be kept by an existing NPC (`keeper_npc_id`).",
    inputs: {
      location_type: { type: "string", description: "Kind of place.", label: "Kind of place", list: "location_type" },
      parent_id: { type: "string", description: "Id of the place in this campaign it sits inside.", label: "Inside", record: "location", group: "Where it sits" },
      keeper_npc_id: { type: "string", description: "Id of an NPC in this campaign who keeps or owns it (the innkeeper, the lord).", label: "Kept by", record: "npc", group: "Where it sits" },
      links: { ...linksFor("location", "a faction that holds it, a god worshipped there, an NPC who lives or works there"), group: "Where it sits" },
      image: { ...image, label: "Location art" },
      map: { type: "boolean", description: "Also draw a map sketch of it. Costs extra; only when the DM asked for a map.", label: "Map sketch", hint: "Drawn by AI, priced as a second picture" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A crumbling dwarven forge district deep beneath the mountain, long abandoned after a cave-in sealed the lower tunnels and the forgemasters never returned…", required: true, max: 1000 },
    ask: ["image"],
  },
  {
    id: "deity", action: "Create deity", noun: "deity", ending: "record",
    describe: "A god or power, with domains and an emblem. It can join an existing pantheon (`pantheon_id`).",
    inputs: {
      pantheon_id: { type: "string", description: "Id of a pantheon in this campaign it belongs to.", label: "Pantheon", list: "pantheon" },
      alignment: { type: "string", description: "Alignment.", label: "Alignment", list: "deity_alignment" },
      domain: { type: "string", description: "A domain.", label: "Primary domain", list: "cleric_domain" },
      links: linksFor("deity", "a faction or NPC who serves them, a holy place, a relic"),
      image: { ...image, label: "Portrait" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A weary goddess of crossroads and second chances, worshipped by wanderers and exiles, who bargains rather than commands…", required: true, max: 1000 },
  },
  {
    id: "species", action: "Create species", noun: "species", ending: "record", fiveE: true,
    describe: "A playable species.",
    inputs: {
      size: { type: "string", description: "Size.", enum: ["tiny", "small", "medium", "large"], label: "Size" },
      image: { ...image, label: "Portrait" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A people of ash and ember who walk the cooled lava fields of the Smoulder Coast, quiet, warm to the touch, and wary of rain…", required: true, max: 1000 },
  },
  {
    id: "background", action: "Create background", noun: "background", ending: "record", fiveE: true,
    describe: "A character background.",
    inputs: { skill_focus: { type: "string", description: "Skills it leans on.", label: "Skill focus", list: "skill" } },
    concept: { label: "What to make", placeholder: "A former lamplighter of the river district who learned which windows stay dark, and why…", required: true, max: 1000 },
  },
  { id: "class", action: "Create class", noun: "class", ending: "record", fiveE: true, describe: "A custom character class.", inputs: { hit_die: { type: "integer", description: "Hit die faces.", minimum: 6, maximum: 12 } } },
  { id: "subclass", action: "Create subclass", noun: "subclass", ending: "record", fiveE: true, describe: "A subclass (archetype) of an existing class.", inputs: { parent_class: { type: "string", description: "The class it belongs to. Required." } }, ask: ["parent_class"] },
  {
    id: "class_feature", action: "Create ability", noun: "ability", ending: "record", fiveE: true,
    describe: "A class feature or special ability.",
    inputs: {
      activation: { type: "string", description: "How it is used.", enum: ["action", "bonus_action", "reaction", "special"], label: "How it is used", optionLabels: { bonus_action: "Bonus Action" } },
      for_whom: { type: "string", description: "The class or species it is for, if the DM said.", label: "For which class or species", placeholder: "Ranger, Dwarf, Emberwarden…" },
    },
    concept: { label: "What to make", placeholder: "A ranger's trick for turning a fallen tree into cover in a single breath, usable a few times between rests…", required: true, max: 1000 },
  },
  {
    id: "house_rule", action: "Create house rule", noun: "rule", ending: "record",
    describe: "A house rule or optional rule.",
    inputs: {
      category: { type: "string", description: "What it governs.", label: "Category", list: "rule_category" },
      allow_tracker: { type: "boolean", description: "Allow the rule a tracker (a meter players watch). Set true unless the DM said the rule needs none.", label: "Allow a tracker" },
    },
    opened: { allow_tracker: true },
    concept: { label: "What to make", placeholder: "Sanity: characters who witness horrors lose Lucidity, and at low Lucidity they struggle to act. Rest and calming rituals restore it…", required: true, max: 1000 },
  },
  { id: "recipe", action: "Create recipe", noun: "recipe", ending: "record", fiveE: true, describe: "A crafting recipe and what it makes. It can make an existing item (`output_item_id`).", inputs: { discipline: { type: "string", description: "Crafting discipline." }, output_item_id: { type: "string", description: "Id of an existing item in this campaign the recipe produces." } } },
];
