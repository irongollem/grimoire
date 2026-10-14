import type { CampaignSession } from "@/types/session.types";
import type { SessionProposal } from "@/types/scheduling.types";

/** The highest number in the log plus one; empty when nothing is numbered yet. */
export function nextSessionNumber(log: readonly Pick<CampaignSession, "number">[]): number | null {
  let highest: number | null = null;
  for (const { number } of log) {
    if (number !== null && (highest === null || number > highest)) highest = number;
  }
  return highest === null ? null : highest + 1;
}

/** When a session sits in the log: the run if it ran, else the day it was logged for. */
export function sessionWhen(row: Pick<CampaignSession, "started_at" | "played_on" | "created_at">): string {
  return row.started_at ?? row.played_on ?? row.created_at;
}

/** The log, newest first. PostgREST cannot order by coalesce, so the client does. */
export function sortSessionLog<T extends Pick<CampaignSession, "started_at" | "played_on" | "created_at">>(
  log: readonly T[],
): T[] {
  return [...log].sort((a, b) => Date.parse(sessionWhen(b)) - Date.parse(sessionWhen(a)));
}

/** The most recent session that is over: what "last time" refers to. */
export function lastPlayedSession(log: readonly CampaignSession[]): CampaignSession | null {
  return sortSessionLog(log.filter((s) => !(s.started_at && !s.ended_at)))[0] ?? null;
}

/** "Saturday 4 October", from a log row. */
export function formatSessionDay(row: Pick<CampaignSession, "started_at" | "played_on" | "created_at">): string {
  // A date-only column parsed as UTC midnight can slip a day west of UTC, so
  // read it as a local calendar date.
  const date = row.started_at
    ? new Date(row.started_at)
    : row.played_on
      ? new Date(`${row.played_on}T12:00:00`)
      : new Date(row.created_at);
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
}

/** The confirmed scheduled session dated today, if any. */
export function todaysScheduledSession(
  proposals: readonly SessionProposal[],
  today: string,
): SessionProposal | null {
  return proposals.find((p) => p.status === "confirmed" && p.proposed_date === today) ?? null;
}

/**
 * The session Start can offer to continue (#1058): the most recent one that
 * was run, once it has ended. Nothing while one is open (there is nothing to
 * continue), and never a session logged by hand, which had no run. The server
 * holds the same line (`resume_campaign_session`).
 */
export function continuableSession(log: readonly CampaignSession[]): CampaignSession | null {
  let latest: CampaignSession | null = null;
  for (const row of log) {
    if (!row.started_at) continue;
    if (!latest?.started_at || Date.parse(row.started_at) > Date.parse(latest.started_at)) latest = row;
  }
  return latest?.ended_at ? latest : null;
}

/** A break longer than this is a different evening. */
export const CONTINUE_BREAK_HOURS = 4;
/** A run that started longer ago than this is not tonight's, however recently it ended
 *  (a session nobody ended on Thursday, closed on Sunday by "Still playing?"). */
export const CONTINUE_RUN_HOURS = 24;

const HOUR = 60 * 60 * 1000;

/**
 * Whether Start should default to continuing: the session ended a short break
 * ago and began today. Only the default; the DM can pick either way.
 */
export function prefersContinue(
  row: Pick<CampaignSession, "started_at" | "ended_at">,
  now: number = Date.now(),
): boolean {
  if (!row.started_at || !row.ended_at) return false;
  const started = Date.parse(row.started_at);
  const ended = Date.parse(row.ended_at);
  if (Number.isNaN(started) || Number.isNaN(ended)) return false;
  return now - ended <= CONTINUE_BREAK_HOURS * HOUR && now - started <= CONTINUE_RUN_HOURS * HOUR;
}

/** The button that continues a session: "Continue session 14". */
export function continueLabel(row: Pick<CampaignSession, "number">): string {
  return row.number !== null ? `Continue session ${row.number}` : "Continue session";
}

/** When a session ended, as the Start dialog says it: "ended 20 minutes ago". */
export function formatEndedAgo(row: Pick<CampaignSession, "ended_at" | "started_at" | "played_on" | "created_at">, now: number = Date.now()): string {
  if (!row.ended_at) return "";
  const minutes = Math.floor((now - Date.parse(row.ended_at)) / 60000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "ended just now";
  if (minutes < 60) return `ended ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ended ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `played ${formatSessionDay(row)}`;
}
