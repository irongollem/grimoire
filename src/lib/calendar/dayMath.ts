import type { CalendarAdapter } from "@/types/calendar.types";

/**
 * In-world day arithmetic, driven by the campaign's own `CalendarAdapter`.
 *
 * Extracted from `upcoming.ts` for #766, which is the reason it deserves to be
 * shared rather than owned by one widget. Three places in the app used to do
 * this arithmetic and all three did it differently:
 *
 * - `CalendarTimeline.vue`'s `eventToFrac` flattens every month to a nominal
 *   30 days. Fine for placing a pixel on a ruler, wrong for a day count.
 * - `CalendarGrid.vue` hardcoded a Gregorian February rule and applied it to
 *   every adapter, which hid the 30th of Ches in every Harptos leap year
 *   (fixed in `243e1fee`).
 * - `useQuests.ts` had `harptosAbsDays`/`addHarptoDays`, twelve months of
 *   exactly thirty days with intercalary days ignored, and *scheduled and
 *   fired* every quest trigger on it (#766).
 *
 * The last one is instructive: both halves used the same wrong helper, so they
 * agreed with each other perfectly and nothing looked broken. It only surfaced
 * when a dashboard card computed the same date correctly and disagreed.
 *
 * A year here is not a fixed length. Months come from the adapter (via
 * `daysInMonth`, so Gregorian's February can grow), and intercalary days are
 * real days that sit *between* months — Harptos's Shieldmeet exists only in
 * leap years. So everything below walks whole years rather than reaching for a
 * `year * 365` formula, which is the bug this module exists to not have.
 */

/** A dated in-world day. Intercalary days are not addressable this way — they
 *  have a name, not a (month, day) — which is what `addDays` has to cope with. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The adapter's own month length, falling back to its fixed `.days`.
 *  Only Gregorian implements `daysInMonth`; see `CalendarAdapter`. */
export function daysInMonth(adapter: CalendarAdapter, year: number, month: number): number {
  const fromAdapter = adapter.daysInMonth?.(year, month);
  const fixed = adapter.months[month - 1]?.days;
  if (fromAdapter !== undefined) return fromAdapter;
  // A month the adapter does not have is a corrupt stored date rather than a
  // real month; zero keeps the walk finite instead of returning NaN.
  return fixed === undefined ? 0 : fixed;
}

export interface YearIndex {
  /** Ordinal *before* day 1 of each month, so day `d` of month `m` is
   *  `monthStartOrdinal[m - 1] + d`. */
  monthStartOrdinal: number[];
  /** Ordinal of each intercalary day that exists in this year, by name. */
  festivalOrdinals: Map<string, number>;
  /** Every day in the year, dated and intercalary alike. */
  totalDays: number;
}

/**
 * One calendar year's days, in true calendrical order: each month's length,
 * plus each adapter-defined intercalary day slotted in immediately after the
 * month it names (`afterMonth`), in the order the adapter lists them — which
 * is how two festivals sharing an `afterMonth` (Midsummer then Shieldmeet in
 * Harptos) get a stable relative order. An `isLeapOnly` day is included only
 * when `adapter.isLeapYear` says this particular year has it.
 */
export function buildYearIndex(adapter: CalendarAdapter, year: number): YearIndex {
  const monthStartOrdinal: number[] = [];
  const festivalOrdinals = new Map<string, number>();
  let cursor = 0;
  for (let month = 1; month <= adapter.months.length; month++) {
    monthStartOrdinal[month - 1] = cursor;
    cursor += daysInMonth(adapter, year, month);
    for (const intercalary of adapter.intercalaryDays) {
      if (intercalary.afterMonth !== month) continue;
      if (intercalary.isLeapOnly && !adapter.isLeapYear(year)) continue;
      cursor += 1;
      festivalOrdinals.set(intercalary.name, cursor);
    }
  }
  return { monthStartOrdinal, festivalOrdinals, totalDays: cursor };
}

/**
 * A date's 1-based position within its own year.
 *
 * `undefined` for a date the index has no slot for: a festival name the
 * adapter does not declare (a leap-only day in a non-leap year, or one left
 * over from a calendar the campaign has since switched away from), a month
 * outside the adapter's range, or a row with neither a dated day nor a
 * festival name. Every case is real, migrated-in data rather than a bug to
 * throw on.
 */
export function ordinalWithinYear(
  adapter: CalendarAdapter,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
): number | undefined {
  if (festivalDay !== null) return buildYearIndex(adapter, year).festivalOrdinals.get(festivalDay);
  if (month === null || day === null) return undefined;
  if (month < 1 || month > adapter.months.length) return undefined;
  return buildYearIndex(adapter, year).monthStartOrdinal[month - 1] + day;
}

/**
 * Whole days from one (year, ordinal) position to another; negative when the
 * second is earlier. Walks whole years because adjacent years are not the same
 * length — a leap year carries an extra intercalary day.
 */
export function daysBetween(
  adapter: CalendarAdapter,
  fromYear: number,
  fromOrdinal: number,
  toYear: number,
  toOrdinal: number,
): number {
  if (fromYear === toYear) return toOrdinal - fromOrdinal;
  if (toYear < fromYear) return -daysBetween(adapter, toYear, toOrdinal, fromYear, fromOrdinal);
  let days = buildYearIndex(adapter, fromYear).totalDays - fromOrdinal;
  for (let year = fromYear + 1; year < toYear; year++) {
    days += buildYearIndex(adapter, year).totalDays;
  }
  return days + toOrdinal;
}

/**
 * Whole in-world days from one dated day to another. Positive when `to` is
 * later. `undefined` when either date is one the adapter cannot place.
 */
export function daysFromTo(
  adapter: CalendarAdapter,
  from: CalendarDate,
  to: CalendarDate,
): number | undefined {
  const fromOrdinal = ordinalWithinYear(adapter, from.year, from.month, from.day, null);
  const toOrdinal = ordinalWithinYear(adapter, to.year, to.month, to.day, null);
  if (fromOrdinal === undefined || toOrdinal === undefined) return undefined;
  return daysBetween(adapter, from.year, fromOrdinal, to.year, toOrdinal);
}

/** Whether `a` is the same day as or earlier than `b`. */
export function isOnOrBefore(adapter: CalendarAdapter, a: CalendarDate, b: CalendarDate): boolean {
  const span = daysFromTo(adapter, a, b);
  // An unplaceable date cannot be shown to be in the past, and treating it as
  // due would fire a trigger on a date nobody can read.
  return span === undefined ? false : span >= 0;
}

/**
 * The dated day at `ordinal` within `year`, or `undefined` if that ordinal is
 * an intercalary day — which has a name rather than a (month, day).
 */
function datedDayAt(adapter: CalendarAdapter, year: number, ordinal: number): CalendarDate | undefined {
  const { monthStartOrdinal } = buildYearIndex(adapter, year);
  for (let month = 1; month <= adapter.months.length; month++) {
    const start = monthStartOrdinal[month - 1];
    if (start === undefined) continue;
    const length = daysInMonth(adapter, year, month);
    if (ordinal > start && ordinal <= start + length) {
      return { year, month, day: ordinal - start };
    }
  }
  return undefined;
}

/**
 * `offset` in-world days after `from`, as a dated day.
 *
 * Two things this does that the helper it replaced did not:
 *
 * 1. **Intercalary days count as elapsed days.** "Thirty days after Midsummer"
 *    on Harptos crosses a festival, and a calendar that ignores it lands the
 *    DM a day early — which is precisely how quest triggers drifted 5-6 days
 *    per in-world year against the calendar screen.
 * 2. **It never returns a festival.** `quest_trigger_scheduled` stores three
 *    integer columns and has nowhere to put "Shieldmeet", so an offset that
 *    lands on an intercalary day rolls forward to the next dated day rather
 *    than being silently misrepresented as a numbered one. The trigger fires
 *    on the first dated day at or after its true target.
 *
 * Returns `from` unchanged if the adapter cannot place it, which is the same
 * "unreadable data degrades rather than throws" stance as `ordinalWithinYear`.
 */
export function addDays(
  adapter: CalendarAdapter,
  from: CalendarDate,
  offset: number,
): CalendarDate {
  const startOrdinal = ordinalWithinYear(adapter, from.year, from.month, from.day, null);
  if (startOrdinal === undefined) return from;

  let year = from.year;
  let ordinal = startOrdinal + offset;

  // Walk whole years in either direction; each has its own length.
  for (let yearDays = buildYearIndex(adapter, year).totalDays; ordinal > yearDays; ) {
    ordinal -= yearDays;
    year += 1;
    yearDays = buildYearIndex(adapter, year).totalDays;
  }
  while (ordinal < 1) {
    year -= 1;
    ordinal += buildYearIndex(adapter, year).totalDays;
  }

  // Roll forward off an intercalary day; a year is finite so this terminates.
  for (let guard = 0; guard <= buildYearIndex(adapter, year).totalDays; guard++) {
    const dated = datedDayAt(adapter, year, ordinal);
    if (dated !== undefined) return dated;
    ordinal += 1;
    const yearDays = buildYearIndex(adapter, year).totalDays;
    if (ordinal > yearDays) {
      ordinal -= yearDays;
      year += 1;
    }
  }
  return from;
}
