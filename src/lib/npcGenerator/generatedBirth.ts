import type { CalendarAdapter } from "@/types/calendar.types";
import { plainAgeYears, type DatePoint } from "@edge-shared/npcAge";
import { daysInMonth, ordinalWithinYear } from "@/lib/calendar/dayMath";

export interface GeneratedBirth {
  born_year: number | null;
  born_month: number | null;
  born_day: number | null;
}

/** Invent a birthday in the active calendar while preserving the generated age today. */
export function generatedBirthFromAge(
  adapter: CalendarAdapter,
  age: string | null | undefined,
  today: DatePoint,
  random: () => number = Math.random,
): GeneratedBirth {
  const empty = { born_year: null, born_month: null, born_day: null };
  const years = plainAgeYears(age);
  if (years === null || !Number.isInteger(today.year)) return empty;

  const baseYear = today.year - years;
  if (ordinalWithinYear(adapter, today.year, today.month, today.day, null) === undefined) {
    return { ...empty, born_year: baseYear };
  }

  const dates: { year: number; month: number; day: number }[] = [];
  for (let month = 1; month <= adapter.months.length; month++) {
    for (let day = 1; day <= daysInMonth(adapter, today.year, month); day++) {
      // A birthday still to come belongs to the previous birth year, or the
      // displayed age would be a year younger than the age the model gave.
      const beforeBirthday = month > today.month || (month === today.month && day > today.day);
      const year = baseYear - (beforeBirthday ? 1 : 0);
      if (day <= daysInMonth(adapter, year, month)) dates.push({ year, month, day });
    }
  }

  const date = dates[Math.floor(random() * dates.length)];
  if (!date) return { ...empty, born_year: baseYear };
  return { born_year: date.year, born_month: date.month, born_day: date.day };
}
