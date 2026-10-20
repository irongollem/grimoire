import type { CalendarAdapter, CalendarMoon } from "@/types/calendar.types";
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

/** Days from the moon's anchor to (year, ordinal), or undefined if the anchor can't be placed. */
function offsetFromAnchor(
  adapter: CalendarAdapter,
  moon: CalendarMoon,
  year: number,
  ordinal: number,
): number | undefined {
  const { year: ay, month, day } = moon.fullOn;
  const anchor = ordinalWithinYear(adapter, ay, month, day, null);
  if (anchor === undefined) return undefined;
  return daysBetween(adapter, ay, anchor, year, ordinal);
}

function stateAtOffset(moon: CalendarMoon, d: number): MoonState {
  const age = frac(d / moon.cycleDays + 0.5);
  const phase = MOON_PHASES[Math.round(age * 8) % 8] as MoonPhase;
  // Half-open [-0.5, 0.5) so exactly one day per cycle peaks, even when the
  // cycle is fractional and the exact moment falls between two days.
  const offFull = (age - 0.5) * moon.cycleDays;
  const offNew = (frac(age + 0.5) - 0.5) * moon.cycleDays;
  const peak = offFull >= -0.5 && offFull < 0.5 ? "full" : offNew >= -0.5 && offNew < 0.5 ? "new" : null;
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
