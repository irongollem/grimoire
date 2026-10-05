import type { SessionProposal } from "@/types/scheduling.types";

/**
 * Real-world "next session" logic, shared by the DM dashboard widget and the
 * player Hearth so the two cannot disagree about which date is next or how a
 * countdown reads. `today` is always a LOCAL "YYYY-MM-DD" (`useLocalToday`),
 * never `toISOString().slice(0, 10)`, which is a UTC date.
 */

type ProposalDates = Pick<SessionProposal, "proposed_date" | "status">;

/** The earliest non-cancelled proposal on or after `today`, or null. */
export function pickNextSession<T extends ProposalDates>(proposals: readonly T[], today: string): T | null {
  const upcoming = proposals
    .filter((p) => p.status !== "cancelled" && p.proposed_date >= today)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date));
  return upcoming[0] ?? null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "19:30 to 23:00"; null when the proposal has no start time. Without a duration, just the start. */
export function sessionTimeRange(
  p: Pick<SessionProposal, "proposed_time" | "duration_minutes">,
): string | null {
  if (!p.proposed_time) return null;
  const [h, m] = p.proposed_time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  // Postgres `time` arrives as "19:30:00"; the clock reads "19:30".
  const start = `${pad(h)}:${pad(m)}`;
  const duration = p.duration_minutes;
  if (!duration || duration <= 0) return start;
  const end = (h * 60 + m + duration) % 1440;
  return `${start} to ${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole calendar days from `today` to `date` (both "YYYY-MM-DD"); negative when past. */
export function daysUntil(date: string, today: string): number {
  return Math.round(dayNumber(date) - dayNumber(today));
}

/** "today", "tomorrow", "in 6 days" (a past day reads as "today"; callers filter the past first). */
export function countdownLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

interface AvailabilityRow {
  session_proposal_id: string;
  user_id: string;
  available: boolean;
}

/** How many players said yes, how many have answered, out of `playerCount`. */
export function rsvpTally(
  availability: readonly AvailabilityRow[],
  proposalId: string,
  playerCount: number,
): { yes: number; answered: number; total: number } {
  const rows = availability.filter((a) => a.session_proposal_id === proposalId);
  return { yes: rows.filter((r) => r.available).length, answered: rows.length, total: playerCount };
}

/** The user's own answer: true/false, or null when they have not answered. */
export function myRsvp(
  availability: readonly AvailabilityRow[],
  proposalId: string,
  userId: string | null | undefined,
): boolean | null {
  if (!userId) return null;
  const row = availability.find((a) => a.session_proposal_id === proposalId && a.user_id === userId);
  return row ? row.available : null;
}
