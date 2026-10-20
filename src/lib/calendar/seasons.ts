import type { CalendarAdapter, CalendarSeason } from "@/types/calendar.types";
import { buildYearIndex, daysBetween, daysInMonth, ordinalWithinYear } from "./dayMath";

export interface SeasonState {
  season: CalendarSeason;
  /** 1-based day within the season (festival days count). */
  dayOfSeason: number;
}

interface PlacedStart {
  season: CalendarSeason;
  ordinal: number;
}

/** Each season's start in `year`, by ordinal, ascending. A day past the month's
 *  end clamps to its last day (a start of 30 Feb still starts somewhere); a
 *  month the calendar lacks is skipped. Sorted here so list order never matters. */
function placeStarts(adapter: CalendarAdapter, year: number): PlacedStart[] {
  const { monthStartOrdinal } = buildYearIndex(adapter, year);
  const placed: PlacedStart[] = [];
  for (const season of adapter.seasons) {
    const { month, day } = season.startsOn;
    const base = monthStartOrdinal[month - 1];
    if (base === undefined) continue;
    const clamped = Math.max(1, Math.min(day, daysInMonth(adapter, year, month)));
    placed.push({ season, ordinal: base + clamped });
  }
  return placed.sort((a, b) => a.ordinal - b.ordinal);
}

export function seasonOn(
  adapter: CalendarAdapter,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
): SeasonState | null {
  if (adapter.seasons.length === 0) return null;
  const ordinal = ordinalWithinYear(adapter, year, month, day, festivalDay);
  if (ordinal === undefined) return null;
  const starts = placeStarts(adapter, year);
  let current: PlacedStart | undefined;
  for (const s of starts) if (s.ordinal <= ordinal) current = s;
  if (current) return { season: current.season, dayOfSeason: ordinal - current.ordinal + 1 };
  // Before the year's first start: the season that began last year is still running.
  const previous = placeStarts(adapter, year - 1).at(-1);
  if (!previous) return null;
  return {
    season: previous.season,
    dayOfSeason: daysBetween(adapter, year - 1, previous.ordinal, year, ordinal) + 1,
  };
}

/** Seasons that begin in this month, by day. */
export function seasonStartsInMonth(
  adapter: CalendarAdapter,
  year: number,
  month: number,
): { day: number; season: CalendarSeason }[] {
  const length = daysInMonth(adapter, year, month);
  if (length <= 0) return [];
  return adapter.seasons
    .filter((s) => s.startsOn.month === month)
    .map((season) => ({ day: Math.max(1, Math.min(season.startsOn.day, length)), season }))
    .sort((a, b) => a.day - b.day);
}
