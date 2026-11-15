// A roll the SERVER makes (#1204). Every roll in the app is thrown in the
// browser and posted by its author, so any member could post any total. An AI
// Dungeon Master must never supply a number, and a fight the server advances
// needs dice of its own, so this module rolls with a CSPRNG, builds the log row
// the way the client's `sendRoll` builds it, and stamps it `server_rolled`
// (a stamp no client can write: the trigger in migration 20261115133158).
//
// Pure with effects injected: the MCP tool wires the database in, the tests wire
// in fakes. The dice rules are the app's own, shared by relative path.

import { ALL_DICE, parseExpression, parsedToCounts } from "../../../src/lib/dice/dice.ts";
import type { DieSize, RollResult } from "../../../src/lib/dice/dice.ts";
import { NORMAL_ROLL, rollWithRules } from "../../../src/lib/dice/diceRules.ts";
import type { DiceRules, RollModeKey } from "../../../src/lib/dice/diceRules.ts";
import { plainDiceRules } from "../../../src/lib/dice/plainDiceRules.ts";
import { dnd5eDiceRules } from "../../../src/systems/dnd5e/dice/rules.ts";
import { gameSystemEdition } from "./gameSystem.ts";

export const MAX_DICE = 100;
export const MAX_MODIFIER = 1000;
export const MAX_LABEL_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RollRequest {
  campaignId: string;
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  mode: RollModeKey;
  label: string | null;
  hidden: boolean;
  isDamage: boolean;
}

/** 5e rules for a 5e campaign, plain dice for Generic (mirrors the client registry). */
export function diceRulesFor(gameSystem: unknown): DiceRules {
  return gameSystemEdition(gameSystem) ? dnd5eDiceRules : plainDiceRules;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("The roll request must be an object.");
  return body as Record<string, unknown>;
}

/** The campaign a request names, validated, so its rules can be loaded before the rest is checked. */
export function requestCampaignId(body: unknown): string {
  const id = asRecord(body).campaignId;
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("`campaignId` must be a campaign id.");
  return id;
}

/** Validates a roll request against the campaign's dice rules; throws a message fit for the caller. */
export function parseRollRequest(body: unknown, rules: DiceRules): RollRequest {
  const b = asRecord(body);
  const campaignId = requestCampaignId(b);

  if (typeof b.expression !== "string") throw new Error("`expression` must be a dice expression such as 2d6+3.");
  const parsed = parseExpression(b.expression);
  if (!parsed) throw new Error(`"${b.expression}" is not a dice expression.`);
  if (parsed.terms.length === 0) throw new Error("A roll needs at least one die.");
  for (const term of parsed.terms) {
    if (!ALL_DICE.includes(term.sides as DieSize)) {
      throw new Error(`d${term.sides} is not a die Grimoire rolls (${ALL_DICE.map((d) => `d${d}`).join(", ")}).`);
    }
  }
  const total = parsed.terms.reduce((sum, t) => sum + t.count, 0);
  if (total > MAX_DICE) throw new Error(`A roll takes at most ${MAX_DICE} dice.`);
  if (parsed.modifier < -MAX_MODIFIER || parsed.modifier > MAX_MODIFIER) {
    throw new Error(`The modifier must be between -${MAX_MODIFIER} and ${MAX_MODIFIER}.`);
  }

  let label: string | null = null;
  if (b.label !== undefined && b.label !== null) {
    if (typeof b.label !== "string") throw new Error("`label` must be text.");
    const trimmed = b.label.trim();
    if (trimmed.length > MAX_LABEL_LENGTH) throw new Error(`\`label\` is at most ${MAX_LABEL_LENGTH} characters.`);
    label = trimmed || null;
  }

  let mode: RollModeKey = NORMAL_ROLL;
  if (b.mode !== undefined && b.mode !== null) {
    if (typeof b.mode !== "string") throw new Error("`mode` must be text.");
    const offered = [NORMAL_ROLL, ...rules.options.map((o) => o.key)];
    if (!offered.includes(b.mode)) throw new Error(`This campaign's rules offer these modes: ${offered.join(", ")}.`);
    mode = b.mode;
  }

  for (const flag of ["hidden", "isDamage"] as const) {
    if (b[flag] !== undefined && typeof b[flag] !== "boolean") throw new Error(`\`${flag}\` must be true or false.`);
  }

  return {
    campaignId,
    counts: parsedToCounts(parsed.terms),
    modifier: parsed.modifier,
    mode,
    label,
    hidden: b.hidden === true,
    isDamage: b.isDamage === true,
  };
}

const UINT32_RANGE = 2 ** 32;

function randomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * A fair die from a CSPRNG. `value % sides` over a 32-bit draw favours the low
 * faces whenever `sides` does not divide 2^32, so draws past the last whole
 * multiple of `sides` are thrown away and redrawn.
 */
export function secureDie(sides: number, draw: () => number = randomUint32): number {
  const limit = Math.floor(UINT32_RANGE / sides) * sides;
  for (;;) {
    const value = draw();
    if (value < limit) return (value % sides) + 1;
  }
}

export interface RollOptions {
  rules: DiceRules;
  /** The die source; `secureDie` in production, a fixed die in tests. */
  roll: (sides: number) => number;
}

/** Rolls the request under the rules. The label mirrors the client roller: the caller's, tagged for the mode, else the pool's own. */
export function rollOnServer(request: RollRequest, { rules, roll }: RollOptions): RollResult {
  const result = rollWithRules(rules, request.counts, request.modifier, request.mode, roll);
  if (request.label) result.label = rules.tagLabel(request.label, request.mode, request.counts);
  if (request.isDamage) result.isDamage = true;
  return result;
}

export interface RollMessageRow {
  campaign_id: string;
  user_id: string;
  recipient_user_id: string | null;
  sender_name: string;
  message: string;
  type: "roll" | "dm_roll";
  metadata: RollResult;
  /** True for dice Grimoire's server threw; false for a roll a person made and the server only scored. */
  server_rolled: boolean;
}

/**
 * The `campaign_messages` row for a roll, built as the client's `sendRoll` builds it, plus the stamp. A roll a
 * person made and the server only scored (`serverRolled: false`, its metadata already `manual`) is posted unstamped.
 */
export function rollMessageRow(
  result: RollResult,
  to: { campaignId: string; userId: string; senderName: string; recipientUserId: string | null },
  serverRolled = true,
): RollMessageRow {
  // Crits are always public, as on the client: too exciting to hide.
  const recipient = result.isCrit ? null : to.recipientUserId;
  return {
    campaign_id: to.campaignId,
    user_id: to.userId,
    recipient_user_id: recipient,
    sender_name: to.senderName,
    message: `rolled ${result.label} = ${result.total}`,
    type: recipient ? "dm_roll" : "roll",
    metadata: result,
    server_rolled: serverRolled,
  };
}

export interface ServerRollDeps {
  /** The campaign as the caller's own RLS client sees it; null when it does not exist or is not theirs to see. */
  loadCampaign(id: string): Promise<{ id: string; user_id: string; game_system: unknown } | null>;
  isMember(campaignId: string, userId: string): Promise<boolean>;
  isDm(campaignId: string, userId: string): Promise<boolean>;
  speakerName(campaignId: string, userId: string): Promise<string>;
  /** Writes the row (service role: the stamp cannot be written under a caller's RLS) and returns its id. */
  insertMessage(row: RollMessageRow): Promise<string>;
  roll?: (sides: number) => number;
}

export interface ServerRollOutcome {
  messageId: string;
  result: RollResult;
  /** True when only the DM can see the roll; false when it went to the whole table (a critical always does). */
  hidden: boolean;
}

/** Authorises the caller, rolls on the server, posts the stamped row to the campaign log. */
export async function performServerRoll(body: unknown, userId: string, deps: ServerRollDeps): Promise<ServerRollOutcome> {
  const campaign = await deps.loadCampaign(requestCampaignId(body));
  if (!campaign) throw new Error("No campaign found with that id (it may not exist or you may not have access).");
  if (!(await deps.isMember(campaign.id, userId))) throw new Error("Only a member of the campaign can roll in it.");

  const rules = diceRulesFor(campaign.game_system);
  const request = parseRollRequest(body, rules);
  const dm = await deps.isDm(campaign.id, userId);
  if (request.hidden && !dm) throw new Error("Only the DM can make a hidden roll.");

  const result = rollOnServer(request, { rules, roll: deps.roll ?? secureDie });
  // A DM's hidden roll is a dm_roll addressed to the DM themself, so only they read it.
  const row = rollMessageRow(result, {
    campaignId: campaign.id,
    userId,
    senderName: await deps.speakerName(campaign.id, userId),
    recipientUserId: request.hidden ? userId : null,
  });
  const messageId = await deps.insertMessage(row);
  return { messageId, result, hidden: row.recipient_user_id !== null };
}
