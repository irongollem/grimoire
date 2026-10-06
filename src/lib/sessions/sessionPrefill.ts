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
