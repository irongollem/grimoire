// Planescape (Sigil — Planar Common Reckoning)
// Sigil has no unique calendar of its own; the City of Doors uses a pragmatic
// "common reckoning" shared by planar travellers. 12 months × 30 days = 360 days
// + 5 intercalary Faction Days spread through the year. 7-day week.
// Epoch: PCR (Planar Common Reckoning). Campaign default: 570 PCR.
import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1,  name: "Primum",    alias: "The Opening",      days: 30 },
  { num: 2,  name: "Internum",  alias: "The Seeking",      days: 30 },
  { num: 3,  name: "Tertium",   alias: "The Debating",     days: 30 },
  { num: 4,  name: "Quartum",   alias: "The Arguing",      days: 30 },
  { num: 5,  name: "Quintum",   alias: "The Reckoning",    days: 30 },
  { num: 6,  name: "Sextum",    alias: "The Convergence",  days: 30 },
  { num: 7,  name: "Septimum",  alias: "The Midtide",      days: 30 },
  { num: 8,  name: "Octavum",   alias: "The Wandering",    days: 30 },
  { num: 9,  name: "Nonum",     alias: "The Returning",    days: 30 },
  { num: 10, name: "Decimum",   alias: "The Closing",      days: 30 },
  { num: 11, name: "Undecimum", alias: "The Silence",      days: 30 },
  { num: 12, name: "Duodecimum",alias: "The Reckoning",    days: 30 },
];

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: "Day of Factions",
    afterMonth: 3,
    description: "A day when the great factions of Sigil hold open debates in the Hall of Speakers. Recruitment is aggressive; newcomers are wise to choose a side.",
  },
  {
    name: "Great Bazaar Day",
    afterMonth: 6,
    description: "A planar market day when portals to every known trading plane cycle open in the Great Bazaar. The most exotic goods in the multiverse change hands.",
  },
  {
    name: "Day of the Lady",
    afterMonth: 9,
    description: "A day of enforced quiet in Sigil. No faction meetings. No public violence. The Lady of Pain's dabus scrub the streets. No one knows why — and smart cutters do not ask.",
  },
  {
    name: "Convergence",
    afterMonth: 12,
    description: "The year's end festival, when planar travellers across the multiverse gather debts, settle old scores, and begin new ventures.",
  },
];

export const planescapeAdapter: CalendarAdapter = {
  id: "planescape",
  name: "Planescape (Planar Common Reckoning)",
  epochName: "PCR",
  defaultYear: 570,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,
  weekSize: 7,
  dayLabels: ["Prime", "Bleaker", "Guvner", "Cipher", "Signer", "Sensate", "Deadday"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} PCR`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const week = Math.ceil(day / 7);
      const dayInWeek = ((day - 1) % 7) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${m?.name ?? `Month ${month}`}, ${year} PCR`;
    }
    return `${year} PCR`;
  },
};
