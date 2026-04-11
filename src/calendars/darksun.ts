// Dark Sun (Calendar of Athas — Free Year)
// Athas has 12 months of 30 days each = 360 days + 3 intercalary Festival Days
// placed at seasonal transitions. 10-day weeks (tendays). No leap years.
// The calendar is divided into three seasons of four months each:
//   High Sun (intense heat), Low Sun (bearable warmth), Wind & Fire (fierce storms).
// Epoch: FY (Free Year). Campaign default: 190 FY (classic Dark Sun era).
import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  // High Sun — the brutal summer
  { num: 1,  name: "Scorch",           alias: "High Sun I",    days: 30 },
  { num: 2,  name: "Morrow",           alias: "High Sun II",   days: 30 },
  { num: 3,  name: "Rest",             alias: "High Sun III",  days: 30 },
  { num: 4,  name: "Gather",           alias: "High Sun IV",   days: 30 },
  // Low Sun — the cooler season
  { num: 5,  name: "Cooling",          alias: "Low Sun I",     days: 30 },
  { num: 6,  name: "Haze",             alias: "Low Sun II",    days: 30 },
  { num: 7,  name: "Wind",             alias: "Low Sun III",   days: 30 },
  { num: 8,  name: "Sorrow",           alias: "Low Sun IV",    days: 30 },
  // Wind & Fire — season of storms and transition
  { num: 9,  name: "Smolder",          alias: "Wind & Fire I",  days: 30 },
  { num: 10, name: "Desert's Vengeance",alias: "Wind & Fire II", days: 30 },
  { num: 11, name: "Bloom",            alias: "Wind & Fire III",days: 30 },
  { num: 12, name: "Embers",           alias: "Wind & Fire IV", days: 30 },
];

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: "Festival of the Highest Sun",
    afterMonth: 4,
    description: "The scorching midpoint of High Sun — a brutal day when even the sorcerer-kings' templars retreat indoors. Gladiatorial games are held in shaded arenas.",
  },
  {
    name: "Day of Rest",
    afterMonth: 8,
    description: "The sole intercalary day all city-states observe. Even slave labour halts. Defilers and preservers alike feel the draw of the dying land on this day.",
  },
  {
    name: "Storm's Crown",
    afterMonth: 11,
    description: "The peak of Wind & Fire season — violent dust storms sweep the Tablelands. Caravans shelter and psions meditate on the Way amidst the howling dark.",
  },
];

export const darksunAdapter: CalendarAdapter = {
  id: "darksun",
  name: "Dark Sun (Calendar of Athas)",
  epochName: "FY",
  defaultYear: 190,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,
  weekSize: 10,
  weekRowNames: ["First Tenday", "Second Tenday", "Third Tenday"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} FY`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const tenday = Math.ceil(day / 10);
      const dayInTenday = day - (tenday - 1) * 10;
      return `Day ${dayInTenday} of ${tenday === 1 ? "First" : tenday === 2 ? "Second" : "Third"} Tenday, ${m?.name ?? `Month ${month}`}, ${year} FY`;
    }
    return `${year} FY`;
  },
};
