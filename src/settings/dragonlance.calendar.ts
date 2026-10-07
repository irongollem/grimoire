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
  leapYearRule: "none",
};
