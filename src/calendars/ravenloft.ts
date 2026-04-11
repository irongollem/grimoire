// Ravenloft (Barovian Calendar)
// 12 months of 30 days each = 360 days + 2 intercalary festival nights = 362 days.
// 7-day week. No leap years — time in the Demiplane of Dread is notoriously unreliable.
// Epoch: BC (Barovian Calendar). Campaign default: 735 BC.
import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1,  name: "Deadwinter",   alias: "The Long Dark",     days: 30 },
  { num: 2,  name: "Witchblight",  alias: "The Rime",          days: 30 },
  { num: 3,  name: "Thawing",      alias: "False Spring",      days: 30 },
  { num: 4,  name: "Bloodrose",    alias: "Blooming",          days: 30 },
  { num: 5,  name: "Mourning",     alias: "The Weeping",       days: 30 },
  { num: 6,  name: "Mistmonth",    alias: "High Summer",       days: 30 },
  { num: 7,  name: "Swelter",      alias: "The Fever",         days: 30 },
  { num: 8,  name: "Duskfall",     alias: "The Turning",       days: 30 },
  { num: 9,  name: "Darkening",    alias: "The Long Dusk",     days: 30 },
  { num: 10, name: "Harvestwane",  alias: "Last Harvest",      days: 30 },
  { num: 11, name: "Grimtide",     alias: "The Reckoning",     days: 30 },
  { num: 12, name: "Deepmist",     alias: "The Vanishing",     days: 30 },
];

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: "Mistsday",
    afterMonth: 6,
    description: "The longest night of summer. The Mists draw close and the boundary between life and death blurs. Darklords are said to be at their most powerful.",
  },
  {
    name: "Night of the Walking Dead",
    afterMonth: 12,
    description: "The most dreaded night in Ravenloft — the dead rise from their graves and the Mists swallow entire villages. No one ventures out alone.",
  },
];

export const ravenloftAdapter: CalendarAdapter = {
  id: "ravenloft",
  name: "Ravenloft (Barovian Calendar)",
  epochName: "BC",
  defaultYear: 735,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,
  weekSize: 7,
  dayLabels: ["Moonday", "Grimday", "Ashenday", "Bleakday", "Dreadday", "Wailday", "Darkday"],

  isLeapYear: () => false,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} BC`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      const week = Math.ceil(day / 7);
      const dayInWeek = ((day - 1) % 7) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${m?.name ?? `Month ${month}`}, ${year} BC`;
    }
    return `${year} BC`;
  },
};
