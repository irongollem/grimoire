import type { SettingCalendarDef } from "./types";

export const GREYHAWK_CALENDAR: SettingCalendarDef = {
  name: "Greyhawk (Oerth Common Year)",
  epochName: "CY",
  defaultYear: 591,
  weekStyle: "weekly",
  dayLabels: ["Starday", "Sunday", "Moonday", "Godsday", "Waterday", "Earthday", "Freeday"],
  months: [
    { name: "Fireseek",   alias: "Deep Winter",   days: 28 },
    { name: "Readying",   alias: "Late Winter",   days: 28 },
    { name: "Coldeven",   alias: "Early Spring",  days: 28 },
    { name: "Planting",   alias: "Mid Spring",    days: 28 },
    { name: "Flocktime",  alias: "Late Spring",   days: 28 },
    { name: "Wealsun",    alias: "Early Summer",  days: 28 },
    { name: "Reaping",    alias: "High Summer",   days: 28 },
    { name: "Goodmonth",  alias: "Late Summer",   days: 28 },
    { name: "Harvester",  alias: "Early Autumn",  days: 28 },
    { name: "Patchwall",  alias: "Mid Autumn",    days: 28 },
    { name: "Ready'reat", alias: "Late Autumn",   days: 28 },
    { name: "Sunsebb",    alias: "Early Winter",  days: 28 },
  ],
  intercalaryDays: [
    { name: "Needfest",  afterMonth: 12, description: "A mid-winter festival of gift-giving and merriment, lasting a full week." },
    { name: "Growfest",  afterMonth: 3,  description: "A spring festival celebrating the return of warmth and the planting season." },
    { name: "Richfest",  afterMonth: 6,  description: "A midsummer celebration of prosperity, games, and revelry." },
    { name: "Brewfest",  afterMonth: 9,  description: "An autumn harvest festival of feasting, drinking, and thanksgiving." },
  ],
  // Luna and Celene: Luna's anchor (11 Fireseek 591) is a convention. Lore puts Celene full during Growfest, so
  // that is her anchor. Seasons are a convention.
  moons: [
    { name: "Luna", cycleDays: 28, fullOn: { year: 591, month: 1, day: 11 }, color: "#e9e6dc" },
    { name: "Celene", cycleDays: 91, fullOn: { year: 591, festival: "Growfest" }, color: "#bfe3d6" },
  ],
  seasons: [
    { name: "Spring", kind: "spring", startsOn: { month: 3, day: 1 } },
    { name: "Summer", kind: "summer", startsOn: { month: 6, day: 1 } },
    { name: "Autumn", kind: "autumn", startsOn: { month: 9, day: 1 } },
    { name: "Winter", kind: "winter", startsOn: { month: 12, day: 1 } },
  ],
  leapYearRule: "none",
};
