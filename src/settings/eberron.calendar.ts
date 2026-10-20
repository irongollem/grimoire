import type { SettingCalendarDef } from "./types";

export const EBERRON_CALENDAR: SettingCalendarDef = {
  name: "Eberron (Galifar Calendar)",
  epochName: "YK",
  defaultYear: 998,
  weekStyle: "weekly",
  dayLabels: ["Sul", "Mol", "Zol", "Wir", "Zor", "Far", "Sar"],
  months: [
    { name: "Zarantyr",  alias: "Storm Month",    days: 28 },
    { name: "Olarune",   alias: "Sentinel Month", days: 28 },
    { name: "Therendor", alias: "Healer's Month", days: 28 },
    { name: "Eyre",      alias: "Anvil Month",    days: 28 },
    { name: "Dravago",   alias: "Herder's Month", days: 28 },
    { name: "Nymm",      alias: "Crowns Month",   days: 28 },
    { name: "Lharvion",  alias: "Eye Month",      days: 28 },
    { name: "Barrakas",  alias: "Lantern Month",  days: 28 },
    { name: "Rhaan",     alias: "Book Month",     days: 28 },
    { name: "Sypheros",  alias: "Shadow Month",   days: 28 },
    { name: "Aryth",     alias: "Gateway Month",  days: 28 },
    { name: "Vult",      alias: "Warding Month",  days: 28 },
  ],
  intercalaryDays: [],
  // Twelve moons, one per month name, cycles 28..105 days in month order. Lore names the moons and orbits but gives
  // no shared full-moon date, so the common anchor (1 Zarantyr 998) is a convention.
  // Seasons follow the month aliases (Therendor early spring ... Vult early winter); the dates are a convention.
  moons: [
    { name: "Zarantyr", cycleDays: 28, fullOn: { year: 998, month: 1, day: 1 }, color: "#f2efe6" },
    { name: "Olarune", cycleDays: 35, fullOn: { year: 998, month: 1, day: 1 }, color: "#f0c08a" },
    { name: "Therendor", cycleDays: 42, fullOn: { year: 998, month: 1, day: 1 }, color: "#c9ccd1" },
    { name: "Eyre", cycleDays: 49, fullOn: { year: 998, month: 1, day: 1 }, color: "#d8d8de" },
    { name: "Dravago", cycleDays: 56, fullOn: { year: 998, month: 1, day: 1 }, color: "#c8b8e0" },
    { name: "Nymm", cycleDays: 63, fullOn: { year: 998, month: 1, day: 1 }, color: "#efe2a0" },
    { name: "Lharvion", cycleDays: 70, fullOn: { year: 998, month: 1, day: 1 }, color: "#e8e8e8" },
    { name: "Barrakas", cycleDays: 77, fullOn: { year: 998, month: 1, day: 1 }, color: "#cfd2d6" },
    { name: "Rhaan", cycleDays: 84, fullOn: { year: 998, month: 1, day: 1 }, color: "#b8d4ee" },
    { name: "Sypheros", cycleDays: 91, fullOn: { year: 998, month: 1, day: 1 }, color: "#9a9aa2" },
    { name: "Aryth", cycleDays: 98, fullOn: { year: 998, month: 1, day: 1 }, color: "#e07a4a" },
    { name: "Vult", cycleDays: 105, fullOn: { year: 998, month: 1, day: 1 }, color: "#b0aca4" },
  ],
  seasons: [
    { name: "Spring", startsOn: { month: 3, day: 1 } },
    { name: "Summer", startsOn: { month: 6, day: 1 } },
    { name: "Autumn", startsOn: { month: 9, day: 1 } },
    { name: "Winter", startsOn: { month: 12, day: 1 } },
  ],
  leapYearRule: "none",
};
