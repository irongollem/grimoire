import { sortSessionLog } from "@/lib/sessions/sessionPrefill";
import type { CampaignSession, CampaignSessionEnded } from "@/types/session.types";

/**
 * What the Sessions log, the session page and the dashboard widget say about a
 * session, as pure functions of the log row and the facts around it. Kept apart
 * from the components so the wording and the "which gap comes first" rule are
 * unit-testable without mounting anything.
 */

export type SessionRecap = "running" | "recap" | "none";

/** What the right-hand status of a log row says. */
export function sessionRecap(
  row: Pick<CampaignSession, "started_at" | "ended_at">,
  hasNote: boolean,
): SessionRecap {
  if (isRunningSession(row)) return "running";
  return hasNote ? "recap" : "none";
}

/** Open means started and not yet ended. */
export function isRunningSession(row: Pick<CampaignSession, "started_at" | "ended_at">): boolean {
  return row.started_at !== null && row.ended_at === null;
}

/** "1 person", "2 people": the count and its noun, for a meta line. */
export function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3h 40m", "45m"; null for a session with no run behind it or one still going. */
export function sessionDuration(row: Pick<CampaignSession, "started_at" | "ended_at">): string | null {
  if (!row.started_at || !row.ended_at) return null;
  const minutes = Math.round((Date.parse(row.ended_at) - Date.parse(row.started_at)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

function localDate(row: Pick<CampaignSession, "started_at" | "played_on" | "created_at">): Date {
  // A date-only column parsed as UTC midnight can slip a day west of UTC, so
  // read it as a local calendar date.
  if (row.started_at) return new Date(row.started_at);
  if (row.played_on) return new Date(`${row.played_on}T12:00:00`);
  return new Date(row.created_at);
}

/** "Sat 4 Oct": the date column of a log row. */
export function sessionShortDate(row: Pick<CampaignSession, "started_at" | "played_on" | "created_at">): string {
  return localDate(row)
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
}

/** "Saturday 27 September, 19:30 to 22:40 (3h 10m)", or the day alone for a session never run. */
export function sessionPlayedLine(row: CampaignSession): string {
  const day = localDate(row)
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .replace(",", "");
  if (!row.started_at) return day;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (!row.ended_at) return `${day}, from ${clock(row.started_at)}`;
  const duration = sessionDuration(row);
  return `${day}, ${clock(row.started_at)} to ${clock(row.ended_at)}${duration ? ` (${duration})` : ""}`;
}

export interface SessionFacts {
  people: number;
  encounters: number;
}

/** "3h 40m · 2 people met · 1 encounter"; an unrun session says when, or that it predates the log. */
export function sessionMeta(row: CampaignSession, facts: SessionFacts): string {
  if (!row.started_at) {
    return row.played_on ? sessionShortDate(row) : "Played before the log began";
  }
  const parts: string[] = [];
  const duration = sessionDuration(row);
  if (duration) parts.push(duration);
  else if (isRunningSession(row)) parts.push("Under way");
  if (facts.people > 0) parts.push(`${countOf(facts.people, "person", "people")} met`);
  if (facts.encounters > 0) parts.push(countOf(facts.encounters, "encounter", "encounters"));
  return parts.join(" · ");
}

/** Played sessions with no linked note, oldest first: the order a DM should catch up in. */
export function sessionsWithoutNotes(
  log: readonly CampaignSession[],
  noted: ReadonlySet<string>,
): CampaignSession[] {
  const gaps = log.filter((s) => !isRunningSession(s) && !noted.has(s.id));
  return sortSessionLog(gaps).reverse();
}

/** The session a quick line belongs to: the one running, else the last one played. */
export function quickNoteTarget(log: readonly CampaignSession[]): CampaignSession | null {
  const sorted = sortSessionLog(log);
  return sorted.find(isRunningSession) ?? sorted.find((s) => !isRunningSession(s)) ?? null;
}

/** The log's summary line, as the parts to render (the last links to the sorting page). */
export function logSummaryParts(total: number, withoutNotes: number, unsorted: number): string[] {
  const parts = [countOf(total, "session", "sessions")];
  if (withoutNotes > 0) parts.push(`${withoutNotes} without notes`);
  if (unsorted > 0) parts.push(`${countOf(unsorted, "thing", "things")} learned outside any session`);
  return parts;
}

/**
 * Append one paragraph to a note's TipTap JSON. A note with no content becomes a
 * one-paragraph document. Content that is not a TipTap document (legacy HTML) is
 * returned as null rather than overwritten: the caller must not destroy it.
 */
export function appendParagraph(content: string | null, text: string): string | null {
  const paragraph = { type: "paragraph", content: [{ type: "text", text }] };
  if (content === null || content.trim() === "") {
    return JSON.stringify({ type: "doc", content: [paragraph] });
  }
  try {
    const doc: unknown = JSON.parse(content);
    if (typeof doc !== "object" || doc === null || (doc as { type?: unknown }).type !== "doc") return null;
    const body = (doc as { content?: unknown }).content;
    const next = Array.isArray(body) ? [...body, paragraph] : [paragraph];
    return JSON.stringify({ ...doc, content: next });
  } catch {
    return null;
  }
}

/** What ending a session did beyond closing it, since it reaches further than the control clicked. */
export function sessionEndedMessage(closed: CampaignSessionEnded): string {
  const parts: string[] = [];
  if (closed.encounters_ended) parts.push(`${countOf(closed.encounters_ended, "encounter", "encounters")} stopped`);
  if (closed.chains_paused) parts.push(`${countOf(closed.chains_paused, "quest", "quests")} paused`);
  return parts.length ? `Session ended: ${parts.join(", ")}.` : "Session ended.";
}

/** Two or more log rows wearing one number: most often one evening logged twice. */
export interface SharedNumber {
  number: number;
  /** The row the others merge into: the one that was run, else the first logged. */
  keep: CampaignSession;
  absorb: CampaignSession[];
}

/**
 * The numbers worn by more than one finished session, highest first. The log
 * allows a repeat (the number is a label), and the commonest way to get one is
 * an evening both run through Start and written up from its note, which the
 * session-log migration turned into two rows. The running session is left out:
 * it is still being written to and cannot be merged.
 */
export function sessionsSharingANumber(log: readonly CampaignSession[]): SharedNumber[] {
  const byNumber = new Map<number, CampaignSession[]>();
  for (const row of log) {
    if (row.number === null || isRunningSession(row)) continue;
    byNumber.set(row.number, [...(byNumber.get(row.number) ?? []), row]);
  }
  const shared: SharedNumber[] = [];
  for (const [number, rows] of byNumber) {
    if (rows.length < 2) continue;
    const ordered = [...rows].sort(
      (a, b) =>
        Number(b.started_at !== null) - Number(a.started_at !== null) ||
        Date.parse(a.created_at) - Date.parse(b.created_at),
    );
    const [keep, ...absorb] = ordered;
    shared.push({ number, keep, absorb });
  }
  return shared.sort((a, b) => b.number - a.number);
}
