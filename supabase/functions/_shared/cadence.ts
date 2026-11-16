/**
 * A campaign's cadence (#1213): which evenings a regular table plays, computed
 * from one `session_cadences` row and never written ahead as rows.
 *
 * Pure, no Deno imports, like `ics.ts`: the browser imports it through the
 * `@edge-shared` alias, so the evenings the app lists and the RRULE the
 * calendar feed publishes come from one definition and cannot disagree.
 *
 * Every date is a wall-clock "YYYY-MM-DD" with no zone, matching
 * `session_proposals.proposed_date`. Arithmetic runs on UTC day numbers so the
 * host's time zone never moves a day (see `addMinutes` in ics.ts for the bug
 * that taught this).
 */

export type CadenceRepeat = "weekly" | "monthly";

export interface CadenceRule {
  repeat: CadenceRepeat;
  /** Weekly only: 1 = every week, 2 = every other week, … */
  every_weeks: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Monthly only: 1–4, or -1 for the last such weekday of the month. */
  week_of_month: number | null;
  starts_on: string;
  ends_on: string | null;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a day number. 1970-01-01 was a Thursday. */
function isoWeekday(n: number): number {
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

/** The `week`th `weekday` of a month (week -1 = the last one), as a day number. */
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, week: number): number {
  if (week === -1) {
    const last = Date.UTC(year, month0 + 1, 0) / DAY_MS;
    return last - ((isoWeekday(last) - weekday + 7) % 7);
  }
  const first = Date.UTC(year, month0, 1) / DAY_MS;
  return first + ((weekday - isoWeekday(first) + 7) % 7) + (week - 1) * 7;
}

/** The first regular evening: the first matching day on or after `starts_on`. */
export function firstEvening(rule: CadenceRule): string | null {
  const [first] = eveningsBetween(rule, rule.starts_on, null, 1);
  return first ?? null;
}

/**
 * Every regular evening from `from` to `to` (both inclusive; `to` null = no
 * bound, so pass `limit`), in date order. An every-N-weeks rhythm counts its
 * weeks from the first evening, not from `from`, so asking about a later
 * window never shifts which weeks are on.
 */
export function eveningsBetween(
  rule: CadenceRule,
  from: string,
  to: string | null,
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const start = Math.max(dayNumber(from), dayNumber(rule.starts_on));
  const bounds = [to, rule.ends_on].filter((d): d is string => d !== null).map(dayNumber);
  const end = bounds.length ? Math.min(...bounds) : Number.POSITIVE_INFINITY;
  if (end === Number.POSITIVE_INFINITY && limit === Number.POSITIVE_INFINITY) {
    throw new Error("eveningsBetween needs an end date or a limit");
  }
  const out: string[] = [];
  if (start > end) return out;

  if (rule.repeat === "weekly") {
    const anchor = dayNumber(rule.starts_on);
    const first = anchor + ((rule.weekday - isoWeekday(anchor) + 7) % 7);
    const step = 7 * Math.max(1, rule.every_weeks);
    const skip = start <= first ? 0 : Math.ceil((start - first) / step);
    for (let n = first + skip * step; n <= end && out.length < limit; n += step) {
      out.push(fromDayNumber(n));
    }
    return out;
  }

  const week = rule.week_of_month ?? 1;
  const startDate = new Date(start * DAY_MS);
  let year = startDate.getUTCFullYear();
  let month0 = startDate.getUTCMonth();
  while (out.length < limit) {
    const n = nthWeekdayOfMonth(year, month0, rule.weekday, week);
    if (n > end) break;
    if (n >= start) out.push(fromDayNumber(n));
    month0 += 1;
    if (month0 === 12) {
      month0 = 0;
      year += 1;
    }
  }
  return out;
}

/** Whether `date` is one of the rule's regular evenings. */
export function isEvening(rule: CadenceRule, date: string): boolean {
  return eveningsBetween(rule, date, date).length === 1;
}

const ICS_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/**
 * The RFC 5545 RRULE value for the rule. UNTIL is floating local time, as the
 * series' DTSTART is: RFC 5545 requires the two to agree, and a UTC UNTIL on a
 * floating series is rejected by strict clients.
 */
export function cadenceRrule(rule: CadenceRule): string {
  const day = ICS_DAYS[rule.weekday - 1];
  const parts =
    rule.repeat === "weekly"
      ? ["FREQ=WEEKLY", ...(rule.every_weeks > 1 ? [`INTERVAL=${rule.every_weeks}`] : []), `BYDAY=${day}`]
      : ["FREQ=MONTHLY", `BYDAY=${rule.week_of_month ?? 1}${day}`];
  if (rule.ends_on) parts.push(`UNTIL=${rule.ends_on.replace(/-/g, "")}T235959`);
  return parts.join(";");
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ORDINALS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };

/** "Every Thursday", "Every other Saturday", "Every 3 weeks on Friday", "The first Sunday of the month". */
export function describeCadence(rule: Pick<CadenceRule, "repeat" | "every_weeks" | "weekday" | "week_of_month">): string {
  const day = WEEKDAY_NAMES[rule.weekday - 1];
  if (rule.repeat === "monthly") {
    return `The ${ORDINALS[rule.week_of_month ?? 1]} ${day} of the month`;
  }
  if (rule.every_weeks <= 1) return `Every ${day}`;
  if (rule.every_weeks === 2) return `Every other ${day}`;
  return `Every ${rule.every_weeks} weeks on ${day}`;
}
