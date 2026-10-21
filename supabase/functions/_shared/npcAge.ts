/**
 * The one age rule for NPCs and characters, shared by the client and the edge
 * functions (the client imports it as `@edge-shared/npcAge`). Pure: no imports,
 * so Deno and Vite both take it as is.
 *
 * Two jobs:
 *  - `bornYearFromAge`: turn an AI- or import-written age ("45", "45 years old")
 *    into the birth year the app stores, so a generated NPC ages with the
 *    campaign calendar like a hand-made one. Descriptions ("middle-aged",
 *    "ancient", "30s", "20-25") are not ages and give null. A birthday is never
 *    invented: only the year is derived.
 *  - `completedYears`: whole years lived on a date, given a stored birth date.
 *    A birthday still to come this year takes one off; with only a year known,
 *    the difference of years stands. Months are ordered within a year, so a
 *    lexicographic (month, day) comparison is exact.
 */

export interface DatePoint {
  year: number;
  month: number;
  day: number;
}

export interface BirthPoint {
  year: number;
  month: number | null;
  day: number | null;
}

/** Highest age a generated text may claim; beyond it the text is not a plain age. */
export const MAX_PLAIN_AGE = 9999;

const PLAIN_AGE = /^(?:about\s+|around\s+|roughly\s+|approximately\s+|aged?\s+)?(\d{1,4})(?:\s*(?:years?(?:\s+old)?|yrs?|y\/o|yo))?$/i;

/** The whole number of years the text states, or null when it is not a plain age. */
export function plainAgeYears(age: string | null | undefined): number | null {
  const m = PLAIN_AGE.exec((age ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PLAIN_AGE ? n : null;
}

/** `currentYear - age` for a plain whole-number age, else null. */
export function bornYearFromAge(age: string | null | undefined, currentYear: number): number | null {
  const n = plainAgeYears(age);
  if (n === null || !Number.isInteger(currentYear)) return null;
  return currentYear - n;
}

/** Whole years lived on `today`, or null when `today` precedes the birth. */
export function completedYears(born: BirthPoint, today: DatePoint): number | null {
  if (!Number.isInteger(born.year) || !Number.isInteger(today.year)) return null;
  let years = today.year - born.year;
  if (born.month !== null && born.day !== null) {
    const beforeBirthday =
      today.month < born.month || (today.month === born.month && today.day < born.day);
    if (beforeBirthday) years -= 1;
  }
  return years < 0 ? null : years;
}

/**
 * The age line a prompt shows for an NPC: the computed age when a birth year is
 * stored and today is known, else the free-text age, else null.
 */
export function promptAge(
  row: {
    age?: string | null;
    born_year?: number | null;
    born_month?: number | null;
    born_day?: number | null;
  },
  today: DatePoint | null,
): string | null {
  if (today && typeof row.born_year === "number" && Number.isInteger(row.born_year)) {
    const dated =
      Number.isInteger(row.born_month) && Number.isInteger(row.born_day);
    const years = completedYears(
      {
        year: row.born_year,
        month: dated ? (row.born_month as number) : null,
        day: dated ? (row.born_day as number) : null,
      },
      today,
    );
    if (years !== null) return String(years);
  }
  const text = row.age?.trim();
  return text ? text : null;
}

/** A campaign row's current date, or null when any part is missing. */
export function campaignToday(
  c: { current_year?: unknown; current_month?: unknown; current_day?: unknown } | null | undefined,
): DatePoint | null {
  if (!c) return null;
  const { current_year: year, current_month: month, current_day: day } = c;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year: year as number, month: month as number, day: day as number };
}
