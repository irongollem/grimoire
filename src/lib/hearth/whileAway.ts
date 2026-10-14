/**
 * Look after my character (#1059): what the owner's Hearth says about the time
 * someone else had their character. Pure: which hand-over to talk about, how to
 * word it, and what the caretaker's lines add up to. Only what the data says.
 */
import { isHandOverActive } from "@/lib/player/caretaking";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import type { CharacterCaretaker } from "@/types/caretaker.types";
import type { PlayerSessionLabel } from "@/types/session.types";

/** How long after it ends a hand-over is still worth telling the owner about. */
export const WHILE_AWAY_DAYS = 7;
const DAY_MS = 86_400_000;

export interface WhileAwayHandOver {
  handOver: CharacterCaretaker;
  active: boolean;
  /** When it ended: the revocation, else its session's end. Null while active. */
  endedAt: string | null;
  session: PlayerSessionLabel | null;
}

/**
 * The hand-over of this character the owner should hear about: the newest one,
 * if it is in force or ended within a week. `rows` are newest first.
 */
export function pickWhileAway(
  rows: readonly CharacterCaretaker[],
  memberId: string,
  openSessionId: string | null,
  sessions: readonly PlayerSessionLabel[],
  now: Date,
): WhileAwayHandOver | null {
  const handOver = rows.find((row) => row.party_member_id === memberId);
  if (!handOver) return null;
  const session = handOver.session_id ? (sessions.find((s) => s.id === handOver.session_id) ?? null) : null;
  if (isHandOverActive(handOver, openSessionId)) return { handOver, active: true, endedAt: null, session };
  const endedAt = handOver.revoked_at ?? session?.ended_at ?? null;
  if (endedAt === null) return null;
  if (now.getTime() - new Date(endedAt).getTime() > WHILE_AWAY_DAYS * DAY_MS) return null;
  return { handOver, active: false, endedAt, session };
}

/** The slice of a `campaign_messages` row this summary reads. */
export interface AwayLine {
  id: string;
  type: string;
  message: string;
  created_at: string;
  metadata: unknown;
}

export interface NotableLine {
  id: string;
  text: string;
  at: string;
}

export interface AwaySummary {
  lines: number;
  rolls: number;
  crits: number;
  fumbles: number;
  /** Item and currency drops put up for the character. */
  loot: number;
  /** Chat, crits and fumbles, newest first. */
  notable: NotableLine[];
}

const NOTABLE_LIMIT = 3;

function flag(metadata: unknown, key: "isCrit" | "isFumble"): boolean {
  return typeof metadata === "object" && metadata !== null && (metadata as Record<string, unknown>)[key] === true;
}

/** Add up the caretaker's lines, given newest first. */
export function summariseAway(lines: readonly AwayLine[]): AwaySummary {
  let rolls = 0;
  let crits = 0;
  let fumbles = 0;
  let loot = 0;
  const notable: NotableLine[] = [];
  for (const line of lines) {
    const crit = line.type === "roll" && flag(line.metadata, "isCrit");
    const fumble = line.type === "roll" && flag(line.metadata, "isFumble");
    if (line.type === "roll") rolls++;
    if (crit) crits++;
    if (fumble) fumbles++;
    if (line.type === "item_drop" || line.type === "currency_drop") loot++;
    const isNotable = line.type === "chat" || crit || fumble;
    if (isNotable && notable.length < NOTABLE_LIMIT) notable.push({ id: line.id, text: line.message, at: line.created_at });
  }
  return { lines: lines.length, rolls, crits, fumbles, loot, notable };
}

/** The headline: who, which character, and when. */
export function awayHeadline(input: {
  caretaker: string;
  character: string;
  active: boolean;
  session: PlayerSessionLabel | null;
  /** The day it started, used when it has no session to name. */
  startedAt: string;
}): string {
  if (input.active) return `${input.caretaker} is looking after ${input.character}`;
  const when = input.session
    ? `in ${sessionShortLabel(input.session)}`
    : `on ${new Date(input.startedAt).toLocaleDateString(undefined, { weekday: "long" })}`;
  return `${input.caretaker} looked after ${input.character} ${when}`;
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function count(n: number): string {
  return WORDS[n] ?? String(n);
}

/**
 * The tally as plain sentences, like a note left on the sheet: "Four rolls, one
 * of them a natural 20, one a fumble. Two drops were put up for Mira." Empty
 * when there is nothing to say.
 */
export function summarySentences(s: AwaySummary, character: string): string {
  const out: string[] = [];
  if (s.rolls > 0) {
    const extras: string[] = [];
    if (s.crits > 0) extras.push(s.crits === 1 ? "one a natural 20" : `${count(s.crits).toLowerCase()} natural 20s`);
    if (s.fumbles > 0) extras.push(s.fumbles === 1 ? "one a fumble" : `${count(s.fumbles).toLowerCase()} fumbles`);
    const rolls = `${count(s.rolls)} ${s.rolls === 1 ? "roll" : "rolls"}`;
    out.push(extras.length ? `${rolls}, ${extras.join(", ")}.` : `${rolls}.`);
  }
  if (s.loot > 0) {
    out.push(s.loot === 1 ? `One drop was put up for ${character}.` : `${count(s.loot)} drops were put up for ${character}.`);
  }
  return out.join(" ");
}
