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
  leapYearRule: "none",
};
