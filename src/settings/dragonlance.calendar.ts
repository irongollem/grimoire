import type { SettingCalendarDef } from "./types";

export const DRAGONLANCE_CALENDAR: SettingCalendarDef = {
  name: "Dragonlance (Krynn Common Calendar)",
  epochName: "AC",
  defaultYear: 351,
  weekStyle: "weekly",
  dayLabels: ["Linaras", "Palast", "Bakukal", "Bracha", "Misham", "Kirinor", "Majetag"],
  months: [
    { name: "Newkolt",    alias: "New Cold",        days: 28 },
    { name: "Deepkolt",   alias: "Deep Cold",       days: 28 },
    { name: "Brookgreen", alias: "Green Brook",     days: 28 },
    { name: "Yurthgreen", alias: "Spring Green",    days: 28 },
    { name: "Fleurgreen", alias: "Flower Green",    days: 28 },
    { name: "Holden",     alias: "Midsummer Hold",  days: 28 },
    { name: "Fierswelt",  alias: "Fierce Heat",     days: 28 },
    { name: "Reapember",  alias: "Reaping Time",    days: 28 },
    { name: "Paleswelt",  alias: "Pale Heat",       days: 28 },
    { name: "Havesthold", alias: "Harvest Hold",    days: 28 },
    { name: "Frostkolt",  alias: "Frost Cold",      days: 28 },
    { name: "Darkember",  alias: "Dark Ember",      days: 28 },
  ],
  intercalaryDays: [],
  // All three moons are full together on 1 month 1 of 351 so they align (the Night of the Eye) every 504 days,
  // the lcm of 36, 28 and 8 being 504. The shared anchor and the season dates are a convention.
  moons: [
    { name: "Solinari", cycleDays: 36, fullOn: { year: 351, month: 1, day: 1 }, color: "#ecedf3" },
    { name: "Lunitari", cycleDays: 28, fullOn: { year: 351, month: 1, day: 1 }, color: "#c2412d" },
    { name: "Nuitari", cycleDays: 8, fullOn: { year: 351, month: 1, day: 1 }, color: "#3a3550" },
  ],
  seasons: [
    { name: "Spring", kind: "spring", startsOn: { month: 3, day: 1 } },
    { name: "Summer", kind: "summer", startsOn: { month: 6, day: 1 } },
    { name: "Autumn", kind: "autumn", startsOn: { month: 9, day: 1 } },
    { name: "Winter", kind: "winter", startsOn: { month: 12, day: 1 } },
  ],
  leapYearRule: "none",
};
