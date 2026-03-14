// Dragonlance (Krynn — Solamnic / Common Calendar)
// 12 months of 28 days each = 336 days. No leap years.
// 7-day week: Linaras, Palast, Bakukal, Bracha, Misham, Kirinor, Majetag.
// No intercalary days in the common calendar.
// Epoch: AC (Age of Cataclysm / After Cataclysm). Campaign default: 351 AC (War of the Lance era).
// Note: month names follow the Ansalon common calendar (some sources vary).
import type { CalendarAdapter, CalendarMonth } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1, name: "Newkolt", alias: "New Cold", days: 28 },
  { num: 2, name: "Deepkolt", alias: "Deep Cold", days: 28 },
  { num: 3, name: "Brookgreen", alias: "Green Brook", days: 28 },
  { num: 4, name: "Yurthgreen", alias: "Spring Green", days: 28 },
  { num: 5, name: "Fleurgreen", alias: "Flower Green", days: 28 },
  { num: 6, name: "Holden", alias: "Midsummer Hold", days: 28 },
  { num: 7, name: "Fierswelt", alias: "Fierce Heat", days: 28 },
  { num: 8, name: "Reapember", alias: "Reaping Time", days: 28 },
  { num: 9, name: "Paleswelt", alias: "Pale Heat", days: 28 },
  { num: 10, name: "Havesthold", alias: "Harvest Hold", days: 28 },
  { num: 11, name: "Frostkolt", alias: "Frost Cold", days: 28 },
  { num: 12, name: "Darkember", alias: "Dark Ember", days: 28 },
];

export const dragonlanceAdapter: CalendarAdapter = {
  id: "dragonlance",
  name: "Dragonlance (Krynn Common Calendar)",
  epochName: "AC",
  defaultYear: 351,
  months: MONTHS,
  intercalaryDays: [],
  weekSize: 7,
  dayLabels: ["Linaras", "Palast", "Bakukal", "Bracha", "Misham", "Kirinor", "Majetag"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} AC`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const week = Math.ceil(day / 7);
      const dayInWeek = ((day - 1) % 7) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${m?.name ?? `Month ${month}`}, ${year} AC`;
    }
    return `${year} AC`;
  },
};
