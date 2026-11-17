// What a turn request says and how the player's message reaches the narrator (#1205, #1021). Split from `handler.ts`
// so the handler holds the turn's rules. Pure.

import { parseRollAnswer, type RollAnswer } from "../_shared/agent/playerRoll.ts";

/** The longest message a player may send. */
export const MAX_MESSAGE_CHARS = 4000;

export interface AgentTurnBody {
  campaignId: string;
  sessionId?: string;
  /**
   * Where a NEW conversation begins. The page knows where the player sat down (the place they opened the table
   * from), and a narrator left to find it spends a turn searching: 21 s live, against 4 s with the place known.
   * Refused together with `sessionId`: a conversation already under way is moved by the narrator, never by a request.
   */
  startLocationId?: string;
  /**
   * The campaign character the player plays, for a NEW conversation only: the conversation keeps it. Refused together
   * with `sessionId`, like `startLocationId`: who is played is chosen once, when the table is sat down at.
   */
  characterId?: string;
  message: string;
  /** Enter says it aloud, Alt+Enter does it: the player chooses, nothing guesses from the wording. */
  mode: "say" | "do";
  /**
   * The player's answer to a roll the narrator asked for. With it the message may be empty: a roll alone is a turn.
   * Refused by the handler when nothing was asked.
   */
  roll?: RollAnswer;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBody(raw: unknown): { ok: true; body: AgentTurnBody } | { ok: false } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false };
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return { ok: false };
  if (r.sessionId !== undefined && (typeof r.sessionId !== "string" || !UUID_RE.test(r.sessionId))) return { ok: false };
  if (typeof r.message !== "string") return { ok: false };
  const message = r.message.trim();
  let roll: RollAnswer | undefined;
  if (r.roll !== undefined) {
    const parsed = parseRollAnswer(r.roll);
    if (parsed === null) return { ok: false };
    roll = parsed;
  }
  // Only a roll makes a turn without words.
  if ((message.length < 1 && roll === undefined) || message.length > MAX_MESSAGE_CHARS) return { ok: false };
  if (r.mode !== "say" && r.mode !== "do") return { ok: false };
  if (r.startLocationId !== undefined) {
    if (typeof r.startLocationId !== "string" || !UUID_RE.test(r.startLocationId)) return { ok: false };
    if (r.sessionId !== undefined) return { ok: false };
  }
  if (r.characterId !== undefined) {
    if (typeof r.characterId !== "string" || !UUID_RE.test(r.characterId) || r.sessionId !== undefined) return { ok: false };
  }
  return {
    ok: true,
    body: {
      campaignId: r.campaignId, sessionId: r.sessionId, startLocationId: r.startLocationId, characterId: r.characterId,
      message, mode: r.mode, ...(roll === undefined ? {} : { roll }),
    },
  };
}

/**
 * The player's message as the narrator reads it. The words themselves are never changed. The button is a hint, not
 * a ruling (maintainer, 16 Nov 2026): it styles the box and settles wording that could be either, but "I crawl
 * towards the tree" sent as said is still a deed, and "nice weather, ain't it!" sent as done is still speech.
 */
export function playerText(mode: "say" | "do", message: string): string {
  return mode === "say"
    ? `The player sent this as something their character says aloud:\n${message}`
    : `The player sent this as something their character does:\n${message}`;
}
