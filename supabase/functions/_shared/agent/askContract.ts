// Ask Grimoire (#1253): the contract between the `ask-turn` function and the panel that streams it.
//
// One file both sides import (the browser through `@edge-shared`), so the generators the model may propose, the
// events the panel reads and the allowance cannot drift apart. Pure data and types: no Deno, no Vue.
//
// The model never runs a generator. It proposes one (`propose`); the panel quotes it with the generator's own price
// and runs it through the same workflow the generator's page uses, after the DM presses the quote's button. So the
// server never creates a record the DM did not ask for, and credits, quota, likeness checks and provenance all stay
// on the path they take today. Design: the "Ask Grimoire" canvas, decisions on issue #1253.

import type { LinkKind } from "../worldLinkCatalogue.ts";

/** Plain questions and brainstorms free per account per UTC day (maintainer, 23 Nov 2026); `charge_ask_answer` holds it. */
export const FREE_ASKS_PER_DAY = 5;

/**
 * How a generator's work ends, which decides what the result offers.
 * - `record`: makes a new record; the notice offers "Open <noun>".
 * - `fill`: fills part of an existing record, so it needs a `target`; the notice offers "Open <noun>" on the target.
 * - `review`: proposes things the DM keeps or drops in the page's own review; the notice offers "Review suggestions".
 * - `screen`: works on something open in an editor; Ask opens that screen with the request filled in and quotes nothing.
 */
export type AskEnding = "record" | "fill" | "review" | "screen";

/** Record kinds Ask can name as a target or link to. Matches the MCP registry's type names where they overlap. */
export type AskRecordType =
  | "npc" | "monster" | "item" | "spell" | "location" | "faction" | "quest" | "quest_beat" | "encounter" | "deity"
  | "party_member" | "note" | "canon" | "room";

/** A JSON Schema property, the subset the generators' inputs use. */
export type AskInputSchema =
  | { type: "string"; description: string; enum?: readonly string[] }
  | { type: "integer"; description: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description: string }
  // Ties to existing records (an array of `{kind, id, relation}`): `subject` is the kind of the NEW record and `kinds`
  // the kinds it may be tied to. The words come from the catalogue (`askLinks.ts`), so they are not listed here.
  | { type: "links"; description: string; subject: LinkKind; kinds: readonly LinkKind[] };

export interface AskGenerator {
  /** Stable id: the `propose` tool's enum and the panel's adapter key. */
  id: string;
  /** What the quote card's heading says: "Create NPC", "Paint portrait". */
  action: string;
  /** The thing it makes or fills, for "Open <noun>": "NPC", "item". */
  noun: string;
  ending: AskEnding;
  /** For the model: when to choose it. One or two sentences. */
  describe: string;
  /** Its options. `concept` (what the DM described) is always present and never listed here. */
  inputs: Readonly<Record<string, AskInputSchema>>;
  /** Inputs that change the result or the price enough that the panel asks when the DM did not say. */
  ask?: readonly string[];
  /** A `fill` generator's target kinds. */
  target?: readonly AskRecordType[];
  /** Only offered where the campaign's game system offers stat blocks and 5e rules (`offers("stat-blocks")`). */
  fiveE?: true;
}

/** The ties an NPC may be given beyond the kin and associate inputs: any kind the catalogue holds for a person. */
const npcLinks = {
  type: "links",
  description: "Ties to existing records of this campaign (a god they worship, a place they work at, a faction's ally, an item they seek, a party member they are bonded to). Each is {kind, id, relation}; relation is what the NEW NPC is to that record, read from the NPC. Use this for any tie that has no input of its own above.",
  subject: "npc",
  kinds: ["npc", "party_member", "faction", "location", "deity", "item", "canon"],
} as const satisfies AskInputSchema;

const image = { type: "boolean", description: "Paint a picture of it as well. Costs extra; ask unless the DM said." } as const;

/**
 * What the NEW NPC is to an existing one, in the words a DM says it. The first four are kin (the page's family tie, written
 * to the kinship table); the rest are the associate ties (the page's "known associate", written as a world link). Read
 * from the new NPC: "mentor" means the new NPC is the mentor, "apprentice" that they are the apprentice. The adapter maps
 * each word to the page's own choice and `askContract.test.ts` holds the list equal to the catalogue's choices.
 */
export const NPC_RELATIONS = [
  "child", "parent", "spouse", "sibling",
  "friend", "ally", "lover", "contact", "rival", "enemy", "mentor", "apprentice", "superior", "subordinate",
  "chosen_family", "former_ally", "former_enemy", "employer", "employee", "patron", "protege", "creditor", "debtor",
  "blackmailer", "blackmailed_by", "betrayed", "betrayed_by", "sworn_to", "holds_oath_of",
] as const;

export const ASK_GENERATORS: readonly AskGenerator[] = [
  // ── makes a record ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "npc", action: "Create NPC", noun: "NPC", ending: "record",
    describe: "A new non-player character: name, look, voice, personality, secret. It can be tied to people, places and factions the campaign already has: say who it is to them (a sister, a former partner, a rival) with `related_npc_id` or `related_pc_id` and `relation`.",
    inputs: {
      name: { type: "string", description: "A name the DM gave." },
      race: { type: "string", description: "Species or race, as the DM said it." },
      age: { type: "integer", description: "Age in years, when the DM gave one.", minimum: 0, maximum: 10000 },
      alignment: { type: "string", description: "Alignment." },
      role: { type: "string", description: "Occupation or role in the world." },
      location_id: { type: "string", description: "Id of a place in this campaign where they live or work." },
      faction_id: { type: "string", description: "Id of a faction in this campaign they belong to." },
      faction_role: { type: "string", description: "Their role in that faction, e.g. Leader, Spy, Member. Only with faction_id." },
      related_npc_id: { type: "string", description: "Id of an existing NPC in this campaign this one is tied to (kin, friend, rival, former partner...). Pair it with `relation`." },
      related_pc_id: { type: "string", description: "Id of an existing party member (player character) in this campaign this one is kin to. Only for the family words of `relation`." },
      relation: { type: "string", description: "What the NEW NPC is to the one in related_npc_id or related_pc_id, read from the new NPC: \"sibling\" = the new NPC is their sibling; \"mentor\" = the new NPC mentors them; \"betrayed\" = the new NPC betrayed them; \"betrayed_by\" = they betrayed the new NPC. Without it a related id is ignored.", enum: NPC_RELATIONS },
      second_parent_id: { type: "string", description: "Id of an existing NPC who is the other parent, when relation is child. Only with related_npc_id or related_pc_id." },
      links: npcLinks,
      portrait: image,
      alter_ego: { type: "boolean", description: "Give them a disguise or second identity." },
    },
    ask: ["portrait"],
  },
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
    inputs: {
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
    inputs: {
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
    inputs: {
      location_type: { type: "string", description: "Kind of place." },
      parent_id: { type: "string", description: "Id of the place in this campaign it sits inside." },
      keeper_npc_id: { type: "string", description: "Id of an NPC in this campaign who keeps or owns it (the innkeeper, the lord)." },
      image,
    },
    ask: ["image"],
  },
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
  { id: "deity", action: "Create deity", noun: "deity", ending: "record", describe: "A god or power, with domains and an emblem. It can join an existing pantheon (`pantheon_id`).", inputs: { pantheon_id: { type: "string", description: "Id of a pantheon in this campaign it belongs to." }, alignment: { type: "string", description: "Alignment." }, domain: { type: "string", description: "A domain." }, image } },
  { id: "species", action: "Create species", noun: "species", ending: "record", fiveE: true, describe: "A playable species.", inputs: { size: { type: "string", description: "Size." }, image } },
  { id: "background", action: "Create background", noun: "background", ending: "record", fiveE: true, describe: "A character background.", inputs: { skill_focus: { type: "string", description: "Skills it leans on." } } },
  { id: "class", action: "Create class", noun: "class", ending: "record", fiveE: true, describe: "A custom character class.", inputs: { hit_die: { type: "integer", description: "Hit die faces.", minimum: 6, maximum: 12 } } },
  { id: "subclass", action: "Create subclass", noun: "subclass", ending: "record", fiveE: true, describe: "A subclass (archetype) of an existing class.", inputs: { parent_class: { type: "string", description: "The class it belongs to. Required." } }, ask: ["parent_class"] },
  { id: "class_feature", action: "Create ability", noun: "ability", ending: "record", fiveE: true, describe: "A class feature or special ability.", inputs: { activation: { type: "string", description: "How it is used." } } },
  { id: "house_rule", action: "Create house rule", noun: "rule", ending: "record", describe: "A house rule or optional rule.", inputs: { category: { type: "string", description: "What it governs." } } },
  { id: "recipe", action: "Create recipe", noun: "recipe", ending: "record", fiveE: true, describe: "A crafting recipe and what it makes. It can make an existing item (`output_item_id`).", inputs: { discipline: { type: "string", description: "Crafting discipline." }, output_item_id: { type: "string", description: "Id of an existing item in this campaign the recipe produces." } } },
  {
    id: "scriptorium_draft", action: "Draft document", noun: "document", ending: "record",
    describe: "A document drafted in the Scriptorium about one record of this campaign: a player handout, a faction dossier, or a session recap.",
    // What `draft-scriptorium-document` takes: it refuses a draft that is not about a record of the campaign.
    inputs: {
      kind: { type: "string", description: "What to draft.", enum: ["handout", "faction_dossier", "session_recap"] },
      subject_type: { type: "string", description: "What it is about. A dossier is about a faction; a recap about a session.", enum: ["npc", "location", "faction", "session"] },
      subject_id: { type: "string", description: "Id of that record in this campaign." },
      audience: { type: "string", description: "Who reads it.", enum: ["players", "dm"] },
    },
    ask: ["kind"],
  },
  // `generate-music` makes 60, 120 or 180 seconds; the browser rounds to the nearest.
  { id: "music_track", action: "Compose music", noun: "track", ending: "record", describe: "A music track for the soundboard.", inputs: { length_seconds: { type: "integer", description: "Length in seconds: 60, 120 or 180.", minimum: 60, maximum: 180 }, vocals: { type: "boolean", description: "With singing." } } },
  // ── fills a record (needs a target) ─────────────────────────────────────────────────────────────────────────────
  { id: "portrait", action: "Paint portrait", noun: "portrait", ending: "fill", describe: "A picture for an existing NPC, party member, monster, item or spell.", inputs: {}, target: ["npc", "party_member", "monster", "item", "spell"] },
  { id: "quest_beat", action: "Write beat", noun: "quest", ending: "fill", describe: "Write a quest beat's title, read-aloud and DM text.", inputs: {}, target: ["quest_beat"] },
  { id: "room", action: "Describe room", noun: "place", ending: "fill", describe: "Describe a room in a site.", inputs: {}, target: ["room"] },
  // ── proposes; the DM keeps or drops in the page's own review ───────────────────────────────────────────────────
  { id: "quest_hooks", action: "Suggest quest hooks", noun: "quest", ending: "review", describe: "Five quest hooks to pick one from and build.", inputs: { quest_giver_id: { type: "string", description: "Id of an NPC who gives it." }, location_id: { type: "string", description: "Id of the place it starts." } } },
  { id: "canon_suggestions", action: "Suggest canon", noun: "canon", ending: "review", describe: "Suggested truths, lore or secrets for the campaign's canon.", inputs: {} },
  { id: "connection_suggestions", action: "Suggest connections", noun: "NPC", ending: "review", describe: "Suggested relationships for an NPC.", inputs: {}, target: ["npc"] },
  // ── needs its screen ────────────────────────────────────────────────────────────────────────────────────────────
  { id: "quest_designer", action: "Design quest", noun: "quest", ending: "screen", describe: "Design a whole quest in conversation, in the Quest Designer.", inputs: {} },
  { id: "map_style", action: "Style map", noun: "map", ending: "screen", describe: "Restyle a Cartographer map.", inputs: {}, target: ["location"] },
  { id: "complication", action: "Add a complication", noun: "encounter", ending: "screen", describe: "A complication or reinforcements in a fight being played.", inputs: {}, target: ["encounter"] },
];

export function askGenerator(id: string): AskGenerator | undefined {
  return ASK_GENERATORS.find((g) => g.id === id);
}

/** A record named in a reply: what "Show what I read" lists and what a link opens. */
export interface AskRecordRef {
  type: AskRecordType;
  id: string;
  name: string;
}

/** One line of a brainstorm idea: something the campaign already says (with the records it rests on), or new. */
export interface AskIdeaLine {
  canon: boolean;
  text: string;
  refs: AskRecordRef[];
}

export interface AskIdea {
  title: string;
  lines: AskIdeaLine[];
  /** Hand the idea to a generator; the panel turns it into a proposal and a quote. */
  handoff?: { generator: string; concept: string; inputs: Record<string, unknown> };
}

/** A generator the model chose, with what it understood. The panel validates every field before it quotes. */
export interface AskProposal {
  proposalId: string;
  generator: string;
  concept: string;
  inputs: Record<string, unknown>;
  target?: AskRecordRef;
}

export interface AskChoice {
  label: string;
  /** What is sent back as the DM's message when the chip is pressed. */
  reply: string;
  /** A price or a distinguishing detail shown small on the chip. */
  note?: string;
}

/** Where the DM was when they asked; the server checks every id against the campaign. */
export interface AskContext {
  route: string;
  record?: { type: AskRecordType; id: string };
}

/** The request body `ask-turn` accepts. */
export interface AskTurnBody {
  campaignId: string;
  /** Omitted for a new conversation. */
  sessionId?: string;
  message: string;
  context?: AskContext;
}

export type AskTurnEnd = "done" | "step_limit" | "budget" | "max_tokens" | "refusal" | "aborted";

/** What the browser hears. Never a tool's raw input or result. */
export type AskEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; isError: boolean }
  /** Records the answer read, for "Show what I read". */
  | { type: "read"; records: AskRecordRef[] }
  /** A question with chips; the DM may also type. */
  | { type: "ask"; question: string; choices: AskChoice[] }
  /** Brainstorm ideas, each line marked canon or new. */
  | { type: "ideas"; ideas: AskIdea[] }
  /** A generator to quote. Nothing has run. */
  | { type: "propose"; proposal: AskProposal }
  /**
   * `routed`: the turn ended at a proposal, so it is inside the generator's price and did not count.
   * Otherwise `free` says whether it used a free answer, `credits` what it charged, `freeLeft` what is left today.
   */
  | { type: "done"; end: AskTurnEnd; routed: boolean; free: boolean; credits: number; freeLeft: number }
  /**
   * `withheld`: the answer already streamed as `text` is replaced by `message` (the output check refused it), so the
   * panel drops the words it showed for this turn. Any other error leaves them.
   */
  | { type: "error"; message: string; withheld?: true };

/** Refusal codes the panel branches on (JSON before the stream opens). */
export const ASK_REFUSALS = {
  /** No free answers left today and not a whole credit to spend: the panel shows the upsell. */
  allowanceSpent: "ask_allowance_spent",
  /** The message is not about the DM's campaign (HTTP 422, before the stream, nothing charged, nothing counted). */
  offTopic: "ask_off_topic",
} as const;

/**
 * The one sentence Ask gives for anything outside the campaign: the 422 refusal's, a withheld answer's, and what the
 * panel shows for the code. One text so the three cannot drift.
 */
export const ASK_OFF_TOPIC_MESSAGE =
  "Ask helps with this campaign: its people, places, story and table. That one is outside what I can help with.";
