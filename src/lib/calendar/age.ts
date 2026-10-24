import type { CalendarAdapter } from "@/types/calendar.types";
import { completedYears } from "@edge-shared/npcAge";
import { ordinalWithinYear } from "./dayMath";

/**
 * Ages from birth dates (#1086). An NPC or character stores `born_year` and,
 * optionally, `born_month` + `born_day`; the age is derived against the
 * campaign's today so it moves when the DM advances the calendar. The
 * free-text `age` column stays for what a date cannot say ("ancient").
 *
 * A dead NPC (`status` "dead") is never aged against today: with a death date
 * the age is the age at death, without one the free-text age stands.
 */

export interface BirthDate {
  year: number;
  month: number | null;
  day: number | null;
}

/** The columns an NPC / party member carries; every one may be absent. */
export interface AgedRow {
  age?: string | null;
  status?: string | null;
  born_year?: number | null;
  born_month?: number | null;
  born_day?: number | null;
  died_year?: number | null;
  died_month?: number | null;
  died_day?: number | null;
}

/** Whether the row is a dead NPC; party members carry no status. */
export function isDeadRow(row: AgedRow): boolean {
  return row.status === "dead";
}

/** The row's death date, or null when it has no death year. */
export function deathOf(row: AgedRow): BirthDate | null {
  if (!isInt(row.died_year)) return null;
  const hasDay = isInt(row.died_month) && isInt(row.died_day);
  return {
    year: row.died_year,
    month: hasDay ? (row.died_month ?? null) : null,
    day: hasDay ? (row.died_day ?? null) : null,
  };
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

/** The row's birth date, or null when it has no birth year. */
export function birthOf(row: AgedRow): BirthDate | null {
  if (!isInt(row.born_year)) return null;
  const hasDay = isInt(row.born_month) && isInt(row.born_day);
  return {
    year: row.born_year,
    month: hasDay ? (row.born_month ?? null) : null,
    day: hasDay ? (row.born_day ?? null) : null,
  };
}

/**
 * Whole years lived on `today`. With a month and day known, a birthday still
 * to come this year takes one off; with only a year, the difference of years
 * stands. Null when `today` precedes the birth, or when the data cannot be
 * placed in this calendar (a non-integer, or a month the adapter lacks after a
 * calendar switch) — callers then fall back to the free-text age.
 */
export function ageOn(
  adapter: CalendarAdapter,
  born: BirthDate,
  today: { year: number; month: number; day: number },
): number | null {
  if (!isInt(born.year) || !isInt(today.year)) return null;
  if (born.month !== null && born.day !== null) {
    if (!isInt(born.month) || !isInt(born.day) || !isInt(today.month) || !isInt(today.day)) {
      return null;
    }
    // Both must be placeable in *today's* year of this calendar (a month the
    // adapter lacks after a calendar switch is not), else fall back to text.
    const birthday = ordinalWithinYear(adapter, today.year, born.month, born.day, null);
    const now = ordinalWithinYear(adapter, today.year, today.month, today.day, null);
    if (birthday === undefined || now === undefined) return null;
  }
  // The arithmetic is the shared rule the edge functions use too.
  return completedYears(born, today);
}

/** "12 Ches 1448 DR", or "1448 DR" when only the year is known. */
export function formatBirthDate(adapter: CalendarAdapter, born: BirthDate): string {
  const dated = born.month !== null && born.day !== null;
  return adapter.formatDate(born.year, dated ? born.month : null, dated ? born.day : null, null);
}

/**
 * What every surface shows for "Age": the computed age when the row has a
 * birth year the calendar can place (the date wins over the free text),
 * otherwise the free-text age, otherwise null. A dead row is measured to its
 * death date, and never to today.
 */
export function displayAge(
  adapter: CalendarAdapter,
  row: AgedRow,
  today: { year: number; month: number; day: number },
): string | null {
  const born = birthOf(row);
  if (born) {
    const died = isDeadRow(row) ? deathOf(row) : null;
    let years: number | null = null;
    if (!isDeadRow(row)) {
      years = ageOn(adapter, born, today);
    } else if (died) {
      // A death with no month cannot place a birthday: the year difference stands.
      years =
        died.month !== null && died.day !== null
          ? ageOn(adapter, born, { year: died.year, month: died.month, day: died.day })
          : ageOn(adapter, { year: born.year, month: null, day: null }, { year: died.year, month: 0, day: 0 });
    }
    if (years !== null) return String(years);
  }
  const text = row.age?.trim();
  return text ? text : null;
}

/** The full birth date for a tooltip, or null when the row has none. */
export function displayBirth(adapter: CalendarAdapter, row: AgedRow): string | null {
  const born = birthOf(row);
  return born ? formatBirthDate(adapter, born) : null;
}

/** The full death date for a tooltip, or null when the row is not dead or has none. */
export function displayDeath(adapter: CalendarAdapter, row: AgedRow): string | null {
  const died = isDeadRow(row) ? deathOf(row) : null;
  return died ? formatBirthDate(adapter, died) : null;
}
