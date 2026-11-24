// Ask Grimoire: Generators that make a catalogue record: creatures, items, spells, places, factions, gods, codex entries, rules, recipes.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";
import { linksFor, image } from "./shared.ts";

export const CATALOGUE_GENERATORS: readonly AskGenerator[] = [
  {
    id: "monster", action: "Create monster", noun: "monster", ending: "record", fiveE: true,
    describe: "A new monster with a full stat block.",
    inputs: {
      challenge_rating: { type: "string", description: "Challenge rating, e.g. \"1/2\" or \"7\"." },
      monster_type: { type: "string", description: "Creature type, e.g. beast, undead, fiend." },
      size: { type: "string", description: "Size.", enum: ["tiny", "small", "medium", "large", "huge", "gargantuan"] },
      image,
    },
    ask: ["challenge_rating", "image"],
  },
  {
    id: "item", action: "Create item", noun: "item", ending: "record", fiveE: true,
    describe: "A new item: magic item, weapon, armour, potion, trinket.",
    inputs: { links: linksFor("item", "its owner, the place it lies in, the faction that guards it, the god it is sacred to"),
      item_type: { type: "string", description: "Kind of item." },
      rarity: { type: "string", description: "Rarity.", enum: ["common", "uncommon", "rare", "very rare", "legendary", "artifact"] },
      cursed: { type: "boolean", description: "Carries a curse." },
      image,
    },
    ask: ["image"],
  },
  {
    id: "spell", action: "Create spell", noun: "spell", ending: "record", fiveE: true,
    describe: "A new spell.",
    inputs: {
      level: { type: "integer", description: "Spell level, 0 for a cantrip.", minimum: 0, maximum: 9 },
      school: { type: "string", description: "School of magic." },
      image,
    },
    ask: ["level", "image"],
  },
  {
    id: "faction", action: "Create faction", noun: "faction", ending: "record",
    describe: "A new faction, guild, cult or organisation, with a leader. An existing NPC can lead it (`leader_npc_id`) and an existing place can be its headquarters (`headquarters_id`).",
    inputs: { links: linksFor("faction", "a place they hold, a god they serve, a rival faction, an NPC who works for them"),
      faction_type: { type: "string", description: "Kind of organisation." },
      alignment: { type: "string", description: "Alignment." },
      leader_npc_id: { type: "string", description: "Id of an existing NPC in this campaign who leads it. They are added as its Leader." },
      leader_name: { type: "string", description: "The leader's name when they are not an existing NPC, if the DM gave one." },
      headquarters_id: { type: "string", description: "Id of an existing place in this campaign where it is based. It is linked as its headquarters." },
      headquarters_name: { type: "string", description: "Where it is based when that place does not exist yet." },
      image,
    },
    ask: ["image"],
  },
  {
    id: "location", action: "Create place", noun: "place", ending: "record",
    describe: "A new place in the Atlas: a town, building, region, dungeon. It can sit inside an existing place (`parent_id`) and be kept by an existing NPC (`keeper_npc_id`).",
    inputs: { links: linksFor("location", "a faction that holds it, a god worshipped there, an NPC who lives or works there"),
      location_type: { type: "string", description: "Kind of place." },
      parent_id: { type: "string", description: "Id of the place in this campaign it sits inside." },
      keeper_npc_id: { type: "string", description: "Id of an NPC in this campaign who keeps or owns it (the innkeeper, the lord)." },
      image,
    },
    ask: ["image"],
  },
  { id: "deity", action: "Create deity", noun: "deity", ending: "record", describe: "A god or power, with domains and an emblem. It can join an existing pantheon (`pantheon_id`).", inputs: { links: linksFor("deity", "a faction or NPC who serves them, a holy place, a relic"), pantheon_id: { type: "string", description: "Id of a pantheon in this campaign it belongs to." }, alignment: { type: "string", description: "Alignment." }, domain: { type: "string", description: "A domain." }, image } },
  { id: "species", action: "Create species", noun: "species", ending: "record", fiveE: true, describe: "A playable species.", inputs: { size: { type: "string", description: "Size." }, image } },
  { id: "background", action: "Create background", noun: "background", ending: "record", fiveE: true, describe: "A character background.", inputs: { skill_focus: { type: "string", description: "Skills it leans on." } } },
  { id: "class", action: "Create class", noun: "class", ending: "record", fiveE: true, describe: "A custom character class.", inputs: { hit_die: { type: "integer", description: "Hit die faces.", minimum: 6, maximum: 12 } } },
  { id: "subclass", action: "Create subclass", noun: "subclass", ending: "record", fiveE: true, describe: "A subclass (archetype) of an existing class.", inputs: { parent_class: { type: "string", description: "The class it belongs to. Required." } }, ask: ["parent_class"] },
  { id: "class_feature", action: "Create ability", noun: "ability", ending: "record", fiveE: true, describe: "A class feature or special ability.", inputs: { activation: { type: "string", description: "How it is used." } } },
  { id: "house_rule", action: "Create house rule", noun: "rule", ending: "record", describe: "A house rule or optional rule.", inputs: { category: { type: "string", description: "What it governs." } } },
  { id: "recipe", action: "Create recipe", noun: "recipe", ending: "record", fiveE: true, describe: "A crafting recipe and what it makes. It can make an existing item (`output_item_id`).", inputs: { discipline: { type: "string", description: "Crafting discipline." }, output_item_id: { type: "string", description: "Id of an existing item in this campaign the recipe produces." } } },
];
