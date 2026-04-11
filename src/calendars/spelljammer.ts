// Spelljammer (Rock of Bral — Spelljammer Standard Year)
// Wildspace has no universal calendar. The Rock of Bral trading hub uses a
// practical 12-month standard shared by most major spacefaring ports.
// 12 months × 30 days = 360 days + 5 intercalary Void Days. 7-day week.
// Epoch: SY (Spelljammer Year). Campaign default: 5048 SY.
import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1,  name: "Starrise",   alias: "New Voyage",        days: 30 },
  { num: 2,  name: "Coldvoid",   alias: "The Long Dark",     days: 30 },
  { num: 3,  name: "Windtack",   alias: "Sailing Season",    days: 30 },
  { num: 4,  name: "Brightburn", alias: "Sun-Facing",        days: 30 },
  { num: 5,  name: "Spelltide",  alias: "The Convergence",   days: 30 },
  { num: 6,  name: "Higharch",   alias: "Midsphere",         days: 30 },
  { num: 7,  name: "Driftmonth", alias: "The Quiet Drift",   days: 30 },
  { num: 8,  name: "Emberfall",  alias: "Cooling Season",    days: 30 },
  { num: 9,  name: "Stargather", alias: "The Counting",      days: 30 },
  { num: 10, name: "Grayreach",  alias: "The Long Haul",     days: 30 },
  { num: 11, name: "Deepvoid",   alias: "Dead Reckoning",    days: 30 },
  { num: 12, name: "Returntide", alias: "Homeport",          days: 30 },
];

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: "Void Day",
    afterMonth: 3,
    description: "A traditional rest day observed by Spelljammer crews — no navigation, no cargo handling. Ships drift and crews share stories of distant spheres.",
  },
  {
    name: "Great Market",
    afterMonth: 6,
    description: "The annual festival on the Rock of Bral. Ships from dozens of crystal spheres gather to trade, race their spelljammers, and seek new crew.",
  },
  {
    name: "Night of Shooting Stars",
    afterMonth: 9,
    description: "A single night when an unusual number of meteors streak across every crystal sphere. Navigators use it to verify their star charts.",
  },
];

export const spelljammerAdapter: CalendarAdapter = {
  id: "spelljammer",
  name: "Spelljammer (Bral Standard Year)",
  epochName: "SY",
  defaultYear: 5048,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,
  weekSize: 7,
  dayLabels: ["Helm", "Keel", "Mast", "Rig", "Void", "Port", "Star"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} SY`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const week = Math.ceil(day / 7);
      const dayInWeek = ((day - 1) % 7) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${m?.name ?? `Month ${month}`}, ${year} SY`;
    }
    return `${year} SY`;
  },
};
