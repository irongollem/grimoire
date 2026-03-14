// Greyhawk (World of Oerth) — Common Year calendar
// 12 months of 28 days each (336 days) plus 4 festival weeks of 7 days (Needfest, Growfest,
// Richfest, Brewfest). Modelled here as intercalary single-day festivals for simplicity.
// Epoch: CY (Common Year). Campaign default: 591 CY.
// 7-day week: Starday, Sunday, Moonday, Godsday, Waterday, Earthday, Freeday.
import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1, name: "Fireseek", alias: "Deep Winter", days: 28 },
  { num: 2, name: "Readying", alias: "Late Winter", days: 28 },
  { num: 3, name: "Coldeven", alias: "Early Spring", days: 28 },
  { num: 4, name: "Planting", alias: "Mid Spring", days: 28 },
  { num: 5, name: "Flocktime", alias: "Late Spring", days: 28 },
  { num: 6, name: "Wealsun", alias: "Early Summer", days: 28 },
  { num: 7, name: "Reaping", alias: "High Summer", days: 28 },
  { num: 8, name: "Goodmonth", alias: "Late Summer", days: 28 },
  { num: 9, name: "Harvester", alias: "Early Autumn", days: 28 },
  { num: 10, name: "Patchwall", alias: "Mid Autumn", days: 28 },
  { num: 11, name: "Ready'reat", alias: "Late Autumn", days: 28 },
  { num: 12, name: "Sunsebb", alias: "Early Winter", days: 28 },
];

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: "Needfest",
    afterMonth: 12,
    description: "A mid-winter festival of gift-giving and merriment, lasting a full week.",
  },
  {
    name: "Growfest",
    afterMonth: 3,
    description: "A spring festival celebrating the return of warmth and the planting season.",
  },
  {
    name: "Richfest",
    afterMonth: 6,
    description: "A midsummer celebration of prosperity, games, and revelry.",
  },
  {
    name: "Brewfest",
    afterMonth: 9,
    description: "An autumn harvest festival of feasting, drinking, and thanksgiving.",
  },
];

export const greyhawkAdapter: CalendarAdapter = {
  id: "greyhawk",
  name: "Greyhawk (Oerth Common Year)",
  epochName: "CY",
  defaultYear: 591,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,
  weekSize: 7,
  dayLabels: ["Starday", "Sunday", "Moonday", "Godsday", "Waterday", "Earthday", "Freeday"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} CY`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const week = Math.ceil(day / 7);
      const dayInWeek = ((day - 1) % 7) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${m?.name ?? `Month ${month}`}, ${year} CY`;
    }
    return `${year} CY`;
  },
};
