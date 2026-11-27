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
import { PEOPLE_GENERATORS } from "./askGenerators/people.ts";
import { CATALOGUE_GENERATORS } from "./askGenerators/catalogue.ts";
import { CRAFT_GENERATORS } from "./askGenerators/craft.ts";
import { WRITING_GENERATORS } from "./askGenerators/writing.ts";
import { NOTES_GENERATORS } from "./askGenerators/notes.ts";
import { FILLS_GENERATORS } from "./askGenerators/fills.ts";
import { EDITORS_GENERATORS } from "./askGenerators/editors.ts";
import { SCREENS_GENERATORS } from "./askGenerators/screens.ts";

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

/**
 * What the form (the card's inputs, #1270) needs and the model never reads: the model sees `description` and `enum`
 * only. Every field is optional, so an input not yet migrated still renders from its key.
 */
export interface AskInputMeta {
  /** The DM's word for it, as the generator's panel labels it. */
  label?: string;
  /** Text shown in the empty field, in the DM's own words. With none, the field shows none: the model's `description` is never shown. */
  /** A line under a switch for the DM, when the label alone does not say enough. The model's `description` is never shown. */
  hint?: string;
  placeholder?: string;
  /**
   * A key into the browser's aside registry (`askAsides.ts`): one quiet line under the field that reads the card's
   * current inputs (the encounter's "Uses <table> here"). The model never sees it.
   */
  aside?: string;
  /**
   * A key into the browser's availability registry (`askAvailable.ts`): the input shows only while the campaign can use
   * it (a party picture needs a group portrait and an image provider). While it does not, the form hides the input and
   * clears its value. The model never sees it.
   */
  available?: string;
  /** A fold row's name: inputs sharing a group fold into one row that says what it holds. */
  group?: string;
  /** Shown only while another input is set (or set to one of `is`); with several keys, while any is. Cleared when the condition stops holding. */
  when?: { key: string | readonly string[]; is?: readonly string[] };
}

/** String-only form metadata. */
export interface AskStringMeta {
  /** A key into the browser's option registry (`askOptions.ts`) for a long or campaign-dependent list. */
  list?: string;
  /** For an `*_id` string: which record picker to show; the value is that record's uuid. */
  record?: AskRecordType;
  /** The DM's words for enum values whose plain reading is wrong; any other value reads as itself, capitalised. */
  optionLabels?: Readonly<Record<string, string>>;
  /** Words that run over several lines (lyrics): drawn as a box that grows, not a one-line field. */
  multiline?: true;
}

/** What an @ in the card's concept box offers: the catalogue's items, or the campaign's people, places and factions. */
export type AskMentions = "items" | "entities";

/** A JSON Schema property, the subset the generators' inputs use. */
export type AskInputSchema =
  | ({ type: "string"; description: string; enum?: readonly string[] } & AskInputMeta & AskStringMeta)
  | ({ type: "integer"; description: string; minimum?: number; maximum?: number } & AskInputMeta)
  | ({ type: "boolean"; description: string } & AskInputMeta)
  // Ties to existing records (an array of `{kind, id, relation}`): `subject` is the kind of the NEW record and `kinds`
  // the kinds it may be tied to. The words come from the catalogue (`askLinks.ts`), so they are not listed here.
  | ({ type: "links"; description: string; subject: LinkKind; kinds: readonly LinkKind[] } & AskInputMeta);

export interface AskGenerator {
  /** Stable id: the `propose` tool's enum and the panel's adapter key. */
  id: string;
  /** What the quote card's heading says: "Create NPC", "Paint portrait". */
  action: string;
  /** The thing it makes or fills, for "Open <noun>": "NPC", "item". */
  noun: string;
  ending: AskEnding;
  /**
   * What the primary button of a held result says when it is not "<action>": a chronicle is written by the gilt button
   * and put into the note by "Insert into note". The card reads `createAction ?? action`.
   */
  createAction?: string;
  /** For the model: when to choose it. One or two sentences. */
  describe: string;
  /** Its options. `concept` (what the DM described) is always present and never listed here. */
  inputs: Readonly<Record<string, AskInputSchema>>;
  /** Inputs that change the result or the price enough that the panel asks when the DM did not say. */
  ask?: readonly string[];
  /**
   * The inputs a card opened by the generator's button starts with (the page's own defaults, such as the picture on).
   * A request typed to the model keeps "unsaid = off" (`askFlag`); this is only for the button.
   */
  opened?: Readonly<Record<string, unknown>>;
  /**
   * The card's first field when the generator's button opened it: the box the DM describes what to make in, labelled
   * and worded as the generator's own panel was. A generator without it has no such box.
   */
  concept?: { label: string; placeholder: string; required?: boolean; max?: number; mentions?: AskMentions };
  /** A `fill` generator's target kinds. */
  target?: readonly AskRecordType[];
  /** Only offered where the campaign's game system offers stat blocks and 5e rules (`offers("stat-blocks")`). */
  fiveE?: true;
}

export { NPC_RELATIONS } from "./askGenerators/shared.ts";


/** Every generator Ask can propose, by group (`askGenerators/`). */
export const ASK_GENERATORS: readonly AskGenerator[] = [
  ...PEOPLE_GENERATORS,
  ...CATALOGUE_GENERATORS,
  ...CRAFT_GENERATORS,
  ...WRITING_GENERATORS,
  ...NOTES_GENERATORS,
  ...FILLS_GENERATORS,
  ...EDITORS_GENERATORS,
  ...SCREENS_GENERATORS,
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
  /**
   * The page's title as the DM sees it ("Quests", "Mara Thorne"). Untrusted and capped; it is only ever used to say
   * where a drafted report happened, never to read anything.
   */
  title?: string;
}

/**
 * A bug report or feature request Ask drafted from what the DM said (#1253 follow-up). The fields are exactly the
 * report form's (`create-bug-report/issue.ts` `ReportText`), so the draft fills that form. NOTHING IS SENT: the
 * maintainer's rule is that a report goes out only when the DM gives consent, which is pressing Send in the form the
 * draft opens. No Ask code calls `create-bug-report`.
 */
export type AskReportDraft =
  | { kind: "bug"; where: string; action: string; expected: string; actual: string }
  | { kind: "feature"; where: string; summary: string; problem: string };

/** The request body `ask-turn` accepts. */
export interface AskTurnBody {
  campaignId: string;
  /** Omitted for a new conversation. */
  sessionId?: string;
  message: string;
  context?: AskContext;
  /** `interview`: the Familiar interviews the DM about their campaign (#1282); absent is an ordinary conversation. */
  mode?: "interview";
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
  /** A drafted report for the DM to review in the report form and send, or not. Nothing has been sent. */
  | { type: "report"; report: AskReportDraft }
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
