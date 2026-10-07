import type { SettingCalendarDef } from "./types";

export const MYSTARA_CALENDAR: SettingCalendarDef = {
  name: "Mystara (Thyatian Calendar)",
  epochName: "AC",
  defaultYear: 1000,
  weekStyle: "weekly",
  dayLabels: ["Lunadain", "Gromdain", "Tserdain", "Moldain", "Nytdain", "Lorelain", "Soladain"],
  months: [
    { name: "Nuwmont",   alias: "New Month",    days: 28 },
    { name: "Vatermont", alias: "Deep Winter",  days: 28 },
    { name: "Thaumont",  alias: "Early Spring", days: 28 },
    { name: "Flaurmont", alias: "Spring Bloom", days: 28 },
    { name: "Yarthmont", alias: "Late Spring",  days: 28 },
    { name: "Klarmont",  alias: "Early Summer", days: 28 },
    { name: "Felmont",   alias: "High Summer",  days: 28 },
    { name: "Fyrmont",   alias: "Late Summer",  days: 28 },
    { name: "Ambyrmont", alias: "Early Autumn", days: 28 },
    { name: "Sviftmont", alias: "Mid Autumn",   days: 28 },
    { name: "Eirmont",   alias: "Late Autumn",  days: 28 },
    { name: "Kaldmont",  alias: "Deep Winter",  days: 28 },
  ],
  intercalaryDays: [
    { name: "Festival of Thaumont", afterMonth: 2,  description: "A spring festival welcoming the new growing season, celebrated with fairs and the blessing of fields by Thyatian priests." },
    { name: "Midsummer Festival",   afterMonth: 6,  description: "The great summer celebration: jousting, bardic competitions, and the renewal of noble oaths across the Known World." },
    { name: "Harvest Festival",     afterMonth: 9,  description: "A four-day harvest celebration observed throughout the Known World. Trade caravans converge on market cities." },
    { name: "Kaldmont Festival",    afterMonth: 12, description: "The midwinter feast and gift-giving tradition that closes the Thyatian year. Nobles open their halls to the poor; temples offer free meals." },
  ],
  leapYearRule: "none",
};
