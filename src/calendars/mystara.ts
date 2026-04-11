// Mystara (Thyatian Calendar — After Crowning)
// The Thyatian Calendar is the dominant calendar of the Known World on Mystara.
// 12 months of 28 days each = 336 days + 4 Festival Weeks (one per season)
// represented here as single intercalary festival days for simplicity.
// 7-day week: Lunadain, Gromdain, Tserdain, Moldain, Nytdain, Lorelain, Soladain.
// Epoch: AC (After Crowning of Corran). Campaign default: 1000 AC.
import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1,  name: "Nuwmont",   alias: "New Month",     days: 28 },
  { num: 2,  name: "Vatermont", alias: "Deep Winter",   days: 28 },
  { num: 3,  name: "Thaumont",  alias: "Early Spring",  days: 28 },
  { num: 4,  name: "Flaurmont", alias: "Spring Bloom",  days: 28 },
  { num: 5,  name: "Yarthmont", alias: "Late Spring",   days: 28 },
  { num: 6,  name: "Klarmont",  alias: "Early Summer",  days: 28 },
  { num: 7,  name: "Felmont",   alias: "High Summer",   days: 28 },
  { num: 8,  name: "Fyrmont",   alias: "Late Summer",   days: 28 },
  { num: 9,  name: "Ambyrmont", alias: "Early Autumn",  days: 28 },
  { num: 10, name: "Sviftmont", alias: "Mid Autumn",    days: 28 },
  { num: 11, name: "Eirmont",   alias: "Late Autumn",   days: 28 },
  { num: 12, name: "Kaldmont",  alias: "Deep Winter",   days: 28 },
];

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: "Festival of Thaumont",
    afterMonth: 2,
    description: "A spring festival welcoming the new growing season, celebrated with fairs and the blessing of fields by Thyatian priests.",
  },
  {
    name: "Midsummer Festival",
    afterMonth: 6,
    description: "The great summer celebration — jousting, bardic competitions, and the renewal of noble oaths across the Known World.",
  },
  {
    name: "Harvest Festival",
    afterMonth: 9,
    description: "A four-day harvest celebration observed throughout the Known World. Trade caravans converge on market cities, and the year's crops are assessed.",
  },
  {
    name: "Kaldmont Festival",
    afterMonth: 12,
    description: "The midwinter feast and gift-giving tradition that closes the Thyatian year. Nobles open their halls to the poor; temples offer free meals.",
  },
];

export const mystaraAdapter: CalendarAdapter = {
  id: "mystara",
  name: "Mystara (Thyatian Calendar)",
  epochName: "AC",
  defaultYear: 1000,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,
  weekSize: 7,
  dayLabels: ["Lunadain", "Gromdain", "Tserdain", "Moldain", "Nytdain", "Lorelain", "Soladain"],

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
