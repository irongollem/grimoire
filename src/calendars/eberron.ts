// Eberron (Galifar Calendar / Khorvaire Reckoning)
// 12 months of 28 days each = 336 days. No leap years. No intercalary days.
// 7-day week: Sul, Mol, Zol, Wir, Zor, Far, Sar.
// Epoch: YK (Year of the Kingdom). Campaign default: 998 YK (standard campaign start).
import type { CalendarAdapter, CalendarMonth } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1, name: "Zarantyr", alias: "Storm Month", days: 28 },
  { num: 2, name: "Olarune", alias: "Sentinel Month", days: 28 },
  { num: 3, name: "Therendor", alias: "Healer's Month", days: 28 },
  { num: 4, name: "Eyre", alias: "Anvil Month", days: 28 },
  { num: 5, name: "Dravago", alias: "Herder's Month", days: 28 },
  { num: 6, name: "Nymm", alias: "Crowns Month", days: 28 },
  { num: 7, name: "Lharvion", alias: "Eye Month", days: 28 },
  { num: 8, name: "Barrakas", alias: "Lantern Month", days: 28 },
  { num: 9, name: "Rhaan", alias: "Book Month", days: 28 },
  { num: 10, name: "Sypheros", alias: "Shadow Month", days: 28 },
  { num: 11, name: "Aryth", alias: "Gateway Month", days: 28 },
  { num: 12, name: "Vult", alias: "Warding Month", days: 28 },
];

export const eberronAdapter: CalendarAdapter = {
  id: "eberron",
  name: "Eberron (Galifar Calendar)",
  epochName: "YK",
  defaultYear: 998,
  months: MONTHS,
  intercalaryDays: [],
  weekSize: 7,
  dayLabels: ["Sul", "Mol", "Zol", "Wir", "Zor", "Far", "Sar"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} YK`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const week = Math.ceil(day / 7);
      const dayInWeek = ((day - 1) % 7) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${m?.name ?? `Month ${month}`}, ${year} YK`;
    }
    return `${year} YK`;
  },
};
