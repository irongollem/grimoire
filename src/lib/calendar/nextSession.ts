import type { SessionCadence, SessionProposal } from "@/types/scheduling.types";
import { eveningsBetween } from "@edge-shared/cadence.ts";

/**
 * Real-world "when do we play" logic, shared by the DM dashboard, the
 * Scheduling tab and the player Hearth so none of them can disagree about
 * which evening is next or how a countdown reads. `today` is always a LOCAL
 * "YYYY-MM-DD" (`useLocalToday`), never `toISOString().slice(0, 10)`, which is
 * a UTC date.
 *
 * An evening is either a REGULAR one, computed from the campaign's cadence
 * (#1213) and never stored, or a `session_proposals` row: a one-off, or a
 * deviation that moved or cancelled a regular evening (`replaces_date`).
 */

export type EveningStatus = "regular" | "proposed" | "confirmed";

export interface ScheduledEvening {
  /** The proposal id, or `regular:<date>` for a computed evening. */
  key: string;
  date: string;
  /** HH:mm[:ss] wall-clock, or null. */
  time: string | null;
  durationMinutes: number;
  title: string;
  notes: string | null;
  status: EveningStatus;
  minAttendance: number;
  /** The row behind it; null for a regular evening. */
  proposal: SessionProposal | null;
}

export function regularEvening(cadence: SessionCadence, date: string): ScheduledEvening {
  return {
    key: `regular:${date}`,
    date,
    time: cadence.start_time,
    durationMinutes: cadence.duration_minutes,
    title: cadence.title,
    notes: null,
    status: "regular",
    minAttendance: 1,
    proposal: null,
  };
}

function proposalEvening(p: SessionProposal): ScheduledEvening {
  return {
    key: p.id,
    date: p.proposed_date,
    time: p.proposed_time,
    durationMinutes: p.duration_minutes,
    title: p.title,
    notes: p.notes,
    status: p.status === "confirmed" ? "confirmed" : "proposed",
    minAttendance: p.min_attendance,
    proposal: p,
  };
}

const byWhen = (a: ScheduledEvening, b: ScheduledEvening) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");

/**
 * Every evening from `from` to `to` (inclusive), soonest first: the cadence's
 * regular evenings less any a deviation replaced, plus every proposal that is
 * not cancelled. `to` null with `limit` asks for the next few however far out.
 */
export function scheduledEvenings(
  cadence: SessionCadence | null | undefined,
  proposals: readonly SessionProposal[],
  from: string,
  to: string | null,
  limit = Number.POSITIVE_INFINITY,
): ScheduledEvening[] {
  const replaced = new Set(proposals.flatMap((p) => (p.replaces_date ? [p.replaces_date] : [])));
  // Ask for enough regular evenings that the replaced ones cannot starve the limit.
  const regular = cadence
    ? eveningsBetween(cadence, from, to, limit === Number.POSITIVE_INFINITY ? limit : limit + replaced.size)
        .filter((d) => !replaced.has(d))
        .map((d) => regularEvening(cadence, d))
    : [];
  const rows = proposals
    .filter((p) => p.status !== "cancelled" && p.proposed_date >= from && (to === null || p.proposed_date <= to))
    .map(proposalEvening);
  return [...regular, ...rows].sort(byWhen).slice(0, limit);
}

/** The next evening on or after `today`, regular or proposed, or null. */
export function pickNextSession(
  cadence: SessionCadence | null | undefined,
  proposals: readonly SessionProposal[],
  today: string,
): ScheduledEvening | null {
  return scheduledEvenings(cadence, proposals, today, null, 1)[0] ?? null;
}

/** The evening the table is settled on for today (a regular one, or a confirmed date), if any. */
export function todaysScheduledSession(
  cadence: SessionCadence | null | undefined,
  proposals: readonly SessionProposal[],
  today: string,
): ScheduledEvening | null {
  return scheduledEvenings(cadence, proposals, today, today).find((e) => e.status !== "proposed") ?? null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "19:30 to 23:00"; null when the evening has no start time. Without a duration, just the start. */
export function sessionTimeRange(p: Pick<ScheduledEvening, "time" | "durationMinutes">): string | null {
  if (!p.time) return null;
  const [h, m] = p.time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  // Postgres `time` arrives as "19:30:00"; the clock reads "19:30".
  const start = `${pad(h)}:${pad(m)}`;
  const duration = p.durationMinutes;
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

/**
 * Who is coming to a regular evening: everyone who has not said they cannot.
 * There is no "yes" to give on a cadence, so `answered` counts the absences.
 */
export function absenceTally(
  absences: readonly { absent_on: string }[],
  date: string,
  playerCount: number,
): { yes: number; answered: number; total: number } {
  const out = absences.filter((a) => a.absent_on === date).length;
  return { yes: Math.max(0, playerCount - out), answered: out, total: playerCount };
}
