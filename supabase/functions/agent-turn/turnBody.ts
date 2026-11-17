// What a turn request says and how the player's message reaches the narrator (#1205, #1021). Split from `handler.ts`
// so the handler holds the turn's rules. Pure.

import type { TurnBudget } from "../_shared/agent/fightChange.ts";
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
  mode: "say" | "do" | "ask";
  /**
   * The player's answer to a roll the narrator asked for. With it the message may be empty: a roll alone is a turn.
   * Refused by the handler when nothing was asked.
   */
  roll?: RollAnswer;
  /**
   * The player has just sat down and has said nothing yet: the Dungeon Master opens the scene. Only for a NEW
   * conversation, with an empty message and no roll. A table that waits for the player to speak first into an
   * empty page is not how a session begins.
   */
  opening?: true;
  /** A fight at the table has ended and the page asks the narrator to tell what comes of it. */
  aftermath?: true;
  /** In a fight on the board: whose turn it is and what the player's turn still holds, as the page has it. */
  fightTurn?: TurnBudget;
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
  // Only a literal true opens a scene; anything else is an ordinary request, and an empty one is refused below.
  const opening = r.opening === true;
  // An opening belongs to a conversation that does not exist yet and carries nothing of the player's.
  if (opening && (r.sessionId !== undefined || message.length > 0 || roll !== undefined)) return { ok: false };
  // The fight has ended and the page asks for what comes of it: no words of the player's, in a conversation that exists.
  const aftermath = r.aftermath === true;
  if (aftermath && (opening || r.sessionId === undefined || message.length > 0 || roll !== undefined)) return { ok: false };
  // Only a roll, an opening or a fight's aftermath makes a turn without words.
  if ((message.length < 1 && roll === undefined && !opening && !aftermath) || message.length > MAX_MESSAGE_CHARS) return { ok: false };
  if (r.mode !== "say" && r.mode !== "do" && r.mode !== "ask") return { ok: false };
  let fightTurn: TurnBudget | undefined;
  if (r.fightTurn !== undefined) {
    const t = r.fightTurn;
    if (typeof t !== "object" || t === null || Array.isArray(t)) return { ok: false };
    const { yours, action, bonus, reaction, words } = t as Record<string, unknown>;
    if (![yours, action, bonus, reaction, words].every((v) => typeof v === "boolean")) return { ok: false };
    fightTurn = { yours: yours as boolean, action: action as boolean, bonus: bonus as boolean, reaction: reaction as boolean, words: words as boolean };
  }
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
      message, mode: r.mode, ...(roll === undefined ? {} : { roll }), ...(opening ? { opening: true as const } : {}),
      ...(aftermath ? { aftermath: true as const } : {}),
      ...(fightTurn === undefined ? {} : { fightTurn }),
    },
  };
}

/**
 * The player's message as the narrator reads it. The words themselves are never changed. The button is a hint, not
 * a ruling (maintainer, 16 Nov 2026): it styles the box and settles wording that could be either, but "I crawl
 * towards the tree" sent as said is still a deed, and "nice weather, ain't it!" sent as done is still speech.
 */
export function playerText(mode: "say" | "do" | "ask", message: string): string {
  // A question to the Dungeon Master is the player speaking, not the character (maintainer, 17 Nov 2026: "ben ik nu
  // alleen hier?" was answered as words spoken into an empty room). Nothing in the story happens because of it.
  if (mode === "ask") {
    return (
      "The player asks you, the Dungeon Master, this out of character. Their character does not say or do it, nobody " +
      "in the story hears it, and no time passes:\n" +
      `${message}\n` +
      "Answer the player plainly and briefly in your own text: what their character can see, hear or would know " +
      "here, what they could do, or how a rule works. Give no character a line for it, move nothing, start nothing, " +
      "and tell nothing their character could not perceive or know. When the answer is something you make up (a memory, " +
      "a detail the campaign never wrote), it is as true as anything else you invent: put it on record in this reply, " +
      "and give a named person who has no record yet their own with introduce."
    );
  }
  return mode === "say"
    ? `The player sent this as something their character says aloud:\n${message}`
    : `The player sent this as something their character does:\n${message}`;
}

/**
 * What the narrator reads in place of a player's message when a sitting opens. It asks for the scene and nothing
 * more: the player has not acted, so nothing may be decided for them, and no roll or mark belongs to an opening.
 */
/**
 * What the narrator reads in place of a player's message when a fight at the table has just ended. The state at
 * the head of the turn says how it stands; this only asks for the telling.
 */
export const AFTERMATH_TEXT =
  "The fight has just ended on the board; the section \"Fights\" says how it stands. Tell what comes of it now, in a " +
  "few sentences, from that and nothing else: who is down stays down. Decide nothing for the player's character.";

export const OPENING_TEXT =
  "The player has just sat down at the table and has not said or done anything yet. Open the scene, speaking to them " +
  "as \"you\": two to four sentences that begin with what the senses take in (a smell, a sound, the light, the cold), " +
  "drawn from the place as it is described, then who is here and what they are doing. Show the place; do not sum " +
  "up the adventure or list what remains to be done. If the record shows the story is already under way, one " +
  "sentence may recall the last thing that happened. Someone present may greet them or carry on with what they " +
  "were doing (call speak for that). Decide nothing for the player's character, ask for no roll, and mark no quest move.";
