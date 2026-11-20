import { LORE_KINDS, type CanonEntry, type LoreKind } from "@/types/canon.types";

/** Each kind as the entry's chip and the kind picker word it. */
export const LORE_KIND_LABEL: Record<LoreKind, string> = {
  history: "History",
  legend: "Legend",
  culture: "Culture",
  magic: "Magic",
  place: "Place",
  faith: "Faith",
  other: "Other",
};

export const LORE_KIND_OPTIONS: ReadonlyArray<{ value: LoreKind; label: string }> = LORE_KINDS.map((value) => ({ value, label: LORE_KIND_LABEL[value] }));

/** A date in the world, as the three columns carry it: a month needs a year and a day needs a month. */
export interface WorldDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export const entryDate = (e: Pick<CanonEntry, "world_year" | "world_month" | "world_day">): WorldDate => ({ year: e.world_year, month: e.world_month, day: e.world_day });

/**
 * Lore in the order the world lived it: dated entries first by year, month and day (a year with no month before a
 * month, a month with no day before a day), then the undated in the DM's own order. A stable sort, so entries with the
 * same date keep the order they were given.
 */
export function sortLore<T extends Pick<CanonEntry, "world_year" | "world_month" | "world_day">>(entries: readonly T[]): T[] {
  const dated = entries.filter((e) => e.world_year !== null);
  const undated = entries.filter((e) => e.world_year === null);
  const key = (e: T) => [e.world_year ?? 0, e.world_month ?? 0, e.world_day ?? 0];
  dated.sort((a, b) => {
    const [ay, am, ad] = key(a);
    const [by, bm, bd] = key(b);
    return ay - by || am - bm || ad - bd;
  });
  return [...dated, ...undated];
}

/**
 * A date as the calendar words it, or null when the entry is undated. Year-only reads as the calendar's year alone, so
 * a month or day that was never set is never invented.
 */
export function worldDateLabel(date: WorldDate, format: (year: number, month: number | null, day: number | null, festival: string | null) => string): string | null {
  if (date.year === null) return null;
  return format(date.year, date.month, date.day, null);
}

/**
 * The date as the three columns after one of them changed in the field: clearing the year clears the month and day,
 * and clearing the month clears the day, because the table refuses a month without a year and a day without a month.
 */
export function normaliseDate(date: WorldDate): WorldDate {
  if (date.year === null) return { year: null, month: null, day: null };
  if (date.month === null) return { year: date.year, month: null, day: null };
  return date;
}
