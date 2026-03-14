import type { CalendarAdapter, CalendarMonth } from "@/types/calendar.types";

const MONTHS: CalendarMonth[] = [
  { num: 1, name: "January", alias: "New Year", days: 31 },
  { num: 2, name: "February", alias: "Deepwinter", days: 28 }, // 29 in leap years
  { num: 3, name: "March", alias: "Spring's Eve", days: 31 },
  { num: 4, name: "April", alias: "Springtide", days: 30 },
  { num: 5, name: "May", alias: "Blossomtime", days: 31 },
  { num: 6, name: "June", alias: "Midsummer's Eve", days: 30 },
  { num: 7, name: "July", alias: "Highsummer", days: 31 },
  { num: 8, name: "August", alias: "Harvesttide", days: 31 },
  { num: 9, name: "September", alias: "The Fading", days: 30 },
  { num: 10, name: "October", alias: "Leaffall", days: 31 },
  { num: 11, name: "November", alias: "The Dimming", days: 30 },
  { num: 12, name: "December", alias: "Yuletide", days: 31 },
];

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return MONTHS[month - 1].days;
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

// Returns 0 = Monday … 6 = Sunday (ISO week, Monday-first grid)
function mondayFirstOffset(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0=Sun, 1=Mon, …
  return (jsDay + 6) % 7;
}

export const gregorianAdapter: CalendarAdapter = {
  id: "gregorian",
  name: "Gregorian Calendar",
  epochName: "AD",
  defaultYear: new Date().getFullYear(),
  months: MONTHS,
  intercalaryDays: [],
  weekSize: 7,
  dayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],

  weekdayOffset: mondayFirstOffset,

  isLeapYear: isLeap,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) return `${festivalDay}, ${year} AD`;
    if (month !== null && day !== null) {
      const m = MONTHS.find((mo) => mo.num === month);
      return `${day} ${m?.name ?? `Month ${month}`}, ${year} AD`;
    }
    return `${year} AD`;
  },
};

// Export helper so CalendarGrid can use the real days-in-month count per year
export { daysInMonth };
