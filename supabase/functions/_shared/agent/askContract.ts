// Ask Grimoire (#1253): the contract between the `ask-turn` function and the panel that streams it.
//
// One file both sides import (the browser through `@edge-shared`), so the generators the model may propose, the
// events the panel reads and the allowance cannot drift apart. Pure data and types: no Deno, no Vue.
//
// The model never runs a generator. It proposes one (`propose`); the panel quotes it with the generator's own price
// and runs it through the same workflow the generator's page uses, after the DM presses the quote's button. So the
// server never creates a record the DM did not ask for, and credits, quota, likeness checks and provenance all stay
// on the path they take today. Design: the "Ask Grimoire" canvas, decisions on issue #1253.

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
  | { type: "boolean"; description: string };

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

const image = { type: "boolean", description: "Paint a picture of it as well. Costs extra; ask unless the DM said." } as const;

export const ASK_GENERATORS: readonly AskGenerator[] = [
  // ── makes a record ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "npc", action: "Create NPC", noun: "NPC", ending: "record",
    describe: "A new non-player character: name, look, voice, personality, secret.",
    inputs: {
      name: { type: "string", description: "A name the DM gave." },
      race: { type: "string", description: "Species or race, as the DM said it." },
      age: { type: "integer", description: "Age in years, when the DM gave one.", minimum: 0, maximum: 10000 },
      alignment: { type: "string", description: "Alignment." },
      role: { type: "string", description: "Occupation or role in the world." },
      location_id: { type: "string", description: "Id of a place in this campaign where they live or work." },
      faction_id: { type: "string", description: "Id of a faction in this campaign they belong to." },
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
    describe: "A new faction, guild, cult or organisation, with a leader.",
    inputs: {
      faction_type: { type: "string", description: "Kind of organisation." },
      alignment: { type: "string", description: "Alignment." },
      leader_name: { type: "string", description: "The leader's name, if the DM gave one." },
      headquarters_name: { type: "string", description: "Where it is based." },
      image,
    },
    ask: ["image"],
  },
  {
    id: "location", action: "Create place", noun: "place", ending: "record",
    describe: "A new place in the Atlas: a town, building, region, dungeon.",
    inputs: {
      location_type: { type: "string", description: "Kind of place." },
      parent_id: { type: "string", description: "Id of the place in this campaign it sits inside." },
      image,
    },
    ask: ["image"],
  },
  {
    id: "encounter", action: "Create encounter", noun: "encounter", ending: "record", fiveE: true,
    describe: "A combat encounter with monsters balanced for the party.",
    inputs: { difficulty: { type: "string", description: "How hard.", enum: ["auto", "easy", "medium", "hard", "deadly"] } },
    ask: ["difficulty"],
  },
  { id: "roll_table", action: "Create roll table", noun: "roll table", ending: "record", describe: "A random table to roll on.", inputs: { die: { type: "integer", description: "Faces of the die, e.g. 6, 20, 100.", minimum: 2, maximum: 100 } } },
  { id: "loot_table", action: "Create loot table", noun: "loot table", ending: "record", fiveE: true, describe: "A treasure table for a challenge tier.", inputs: { cr_tier: { type: "string", description: "Challenge tier the loot suits." } } },
  { id: "dungeon_feature", action: "Create dungeon feature", noun: "feature", ending: "record", fiveE: true, describe: "A dungeon feature: a fountain, altar, strange door.", inputs: { feature_type: { type: "string", description: "Kind of feature." }, image } },
  { id: "trap", action: "Create trap", noun: "trap", ending: "record", fiveE: true, describe: "A trap with its trigger, effect and countermeasures.", inputs: { trap_type: { type: "string", description: "Kind of trap." }, image } },
  { id: "puzzle", action: "Create puzzle", noun: "puzzle", ending: "record", describe: "A puzzle room or riddle.", inputs: { puzzle_type: { type: "string", description: "Kind of puzzle." }, difficulty: { type: "string", description: "How hard." }, image } },
  { id: "deity", action: "Create deity", noun: "deity", ending: "record", describe: "A god or power, with domains and an emblem.", inputs: { pantheon: { type: "string", description: "The pantheon it belongs to." }, alignment: { type: "string", description: "Alignment." }, domain: { type: "string", description: "A domain." }, image } },
  { id: "species", action: "Create species", noun: "species", ending: "record", fiveE: true, describe: "A playable species.", inputs: { size: { type: "string", description: "Size." }, image } },
  { id: "background", action: "Create background", noun: "background", ending: "record", fiveE: true, describe: "A character background.", inputs: { skill_focus: { type: "string", description: "Skills it leans on." } } },
  { id: "class", action: "Create class", noun: "class", ending: "record", fiveE: true, describe: "A custom character class.", inputs: { hit_die: { type: "integer", description: "Hit die faces.", minimum: 6, maximum: 12 } } },
  { id: "subclass", action: "Create subclass", noun: "subclass", ending: "record", fiveE: true, describe: "A subclass (archetype) of an existing class.", inputs: { parent_class: { type: "string", description: "The class it belongs to. Required." } }, ask: ["parent_class"] },
  { id: "class_feature", action: "Create ability", noun: "ability", ending: "record", fiveE: true, describe: "A class feature or special ability.", inputs: { activation: { type: "string", description: "How it is used." } } },
  { id: "house_rule", action: "Create house rule", noun: "rule", ending: "record", describe: "A house rule or optional rule.", inputs: { category: { type: "string", description: "What it governs." } } },
  { id: "recipe", action: "Create recipe", noun: "recipe", ending: "record", describe: "A crafting recipe and what it makes.", inputs: { discipline: { type: "string", description: "Crafting discipline." } } },
  { id: "scriptorium_draft", action: "Draft document", noun: "document", ending: "record", describe: "A handout, letter or book drafted in the Scriptorium.", inputs: { kind: { type: "string", description: "What to draft.", enum: ["handout", "book"] } }, ask: ["kind"] },
  { id: "music_track", action: "Compose music", noun: "track", ending: "record", describe: "A music track for the soundboard.", inputs: { length_seconds: { type: "integer", description: "Length in seconds.", minimum: 10, maximum: 180 }, vocals: { type: "boolean", description: "With singing." } } },
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
  | { type: "error"; message: string };

/** Refusal codes the panel branches on (JSON before the stream opens). */
export const ASK_REFUSALS = {
  /** No free answers left today and not a whole credit to spend: the panel shows the upsell. */
  allowanceSpent: "ask_allowance_spent",
} as const;
