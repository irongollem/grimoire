import type { CalendarAdapter, CalendarMoon, MoonAnchor } from "@/types/calendar.types";
import { buildYearIndex, daysBetween, daysInMonth, ordinalWithinYear } from "./dayMath";

/**
 * Moon phases on any calendar, from one anchor per moon: a day it is full.
 *
 * Client-only on purpose. The database mirrors the calendar's date math
 * (months, festivals, leap rules; see `calendarShapeMirror.test.ts`) because
 * SQL schedules things on it. Nothing server-side asks what phase it is.
 *
 * Offsets come from `daysBetween`, which walks whole years: a leap year or a
 * festival that exists only some years shifts every later day, and a
 * `year * 365` shortcut would drift the moon off its cycle.
 */

export type MoonPhase =
  | "new"
  | "waxing_crescent"
  | "first_quarter"
  | "waxing_gibbous"
  | "full"
  | "waning_gibbous"
  | "last_quarter"
  | "waning_crescent";

export const MOON_PHASES: readonly MoonPhase[] = [
  "new",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
];

export const MOON_PHASE_LABELS: Record<MoonPhase, string> = {
  new: "New moon",
  waxing_crescent: "Waxing crescent",
  first_quarter: "First quarter",
  waxing_gibbous: "Waxing gibbous",
  full: "Full moon",
  waning_gibbous: "Waning gibbous",
  last_quarter: "Last quarter",
  waning_crescent: "Waning crescent",
};

export interface MoonState {
  moon: CalendarMoon;
  /** Position in the cycle, [0, 1): 0 = new, 0.5 = full. */
  age: number;
  phase: MoonPhase;
  /** "full" / "new" on the single day of each cycle nearest the exact full / new moment, else null. */
  peak: "full" | "new" | null;
}

function frac(x: number): number {
  return x - Math.floor(x);
}

/** A moon user data can describe (custom calendars) but we can compute. */
function usableCycle(moon: CalendarMoon): boolean {
  return Number.isFinite(moon.cycleDays) && moon.cycleDays > 0;
}

/**
 * The anchor's 1-based ordinal within its own year, or undefined when it cannot
 * be placed: a non-integer year, month or day (user data can hold null or ""),
 * a month outside the calendar, a day outside its month (it would otherwise
 * spill into the next one), or a festival the year does not have.
 */
export function moonAnchorOrdinal(adapter: CalendarAdapter, anchor: MoonAnchor): number | undefined {
  if (typeof anchor !== "object" || anchor === null) return undefined;
  if (!Number.isInteger(anchor.year)) return undefined;
  if ("festival" in anchor) {
    if (typeof anchor.festival !== "string" || anchor.festival === "") return undefined;
    return ordinalWithinYear(adapter, anchor.year, null, null, anchor.festival);
  }
  const { year, month, day } = anchor;
  if (!Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > adapter.months.length) return undefined;
  if (day < 1 || day > daysInMonth(adapter, year, month)) return undefined;
  return ordinalWithinYear(adapter, year, month, day, null);
}

/** Days from the moon's anchor to (year, ordinal), or undefined if the anchor can't be placed. */
function offsetFromAnchor(
  adapter: CalendarAdapter,
  moon: CalendarMoon,
  year: number,
  ordinal: number,
): number | undefined {
  const anchor = moonAnchorOrdinal(adapter, moon.fullOn);
  if (anchor === undefined) return undefined;
  return daysBetween(adapter, moon.fullOn.year, anchor, year, ordinal);
}

function stateAtOffset(moon: CalendarMoon, d: number): MoonState {
  const c = moon.cycleDays;
  // Days since the last exact full moon, [0, c). Computed from the integer
  // offset directly: with a dyadic cycle (30.4375) this is exact, so a moment
  // exactly half a day from a whole day cannot round into zero or two peaks.
  const rem = d - Math.floor(d / c) * c;
  const age = frac(rem / c + 0.5);
  // Half-open [-0.5, 0.5) so exactly one day per cycle peaks.
  const offFull = rem < c / 2 ? rem : rem - c;
  const offNew = rem - c / 2;
  const peak = offFull >= -0.5 && offFull < 0.5 ? "full" : offNew >= -0.5 && offNew < 0.5 ? "new" : null;
  // The label on a peak day is the peak, whatever the 1/8 bucket says.
  const phase = peak ?? (MOON_PHASES[Math.round(age * 8) % 8] as MoonPhase);
  return { moon, age, phase, peak };
}

export function moonsOnOrdinal(adapter: CalendarAdapter, year: number, ordinal: number): MoonState[] {
  const out: MoonState[] = [];
  for (const moon of adapter.moons) {
    if (!usableCycle(moon)) continue;
    const d = offsetFromAnchor(adapter, moon, year, ordinal);
    if (d === undefined) continue;
    out.push(stateAtOffset(moon, d));
  }
  return out;
}

/** Moons on a date; empty when the adapter cannot place the date. */
export function moonsOn(
  adapter: CalendarAdapter,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
): MoonState[] {
  const ordinal = ordinalWithinYear(adapter, year, month, day, festivalDay);
  return ordinal === undefined ? [] : moonsOnOrdinal(adapter, year, ordinal);
}

/**
 * Every day of a month, index 0 = day 1. Cheap: the walk across years happens
 * once per moon (for day 1) and later days step by one, because dated days
 * within a month are consecutive.
 */
export function moonsForMonth(adapter: CalendarAdapter, year: number, month: number): MoonState[][] {
  const length = daysInMonth(adapter, year, month);
  const days: MoonState[][] = Array.from({ length }, () => []);
  const monthStart = buildYearIndex(adapter, year).monthStartOrdinal[month - 1];
  if (monthStart === undefined) return days;
  for (const moon of adapter.moons) {
    if (!usableCycle(moon)) continue;
    const first = offsetFromAnchor(adapter, moon, year, monthStart + 1);
    if (first === undefined) continue;
    for (let i = 0; i < length; i++) days[i]!.push(stateAtOffset(moon, first + i));
  }
  return days;
}
