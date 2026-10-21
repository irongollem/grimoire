import type { SettingCalendarDef } from "./types";

export const DARKSUN_CALENDAR: SettingCalendarDef = {
  name: "Dark Sun (Calendar of Athas)",
  epochName: "FY",
  defaultYear: 190,
  weekStyle: "tenday",
  weekRowNames: ["First Tenday", "Second Tenday", "Third Tenday"],
  months: [
    { name: "Scorch",             alias: "High Sun I",      days: 30 },
    { name: "Morrow",             alias: "High Sun II",     days: 30 },
    { name: "Rest",               alias: "High Sun III",    days: 30 },
    { name: "Gather",             alias: "High Sun IV",     days: 30 },
    { name: "Cooling",            alias: "Low Sun I",       days: 30 },
    { name: "Haze",               alias: "Low Sun II",      days: 30 },
    { name: "Wind",               alias: "Low Sun III",     days: 30 },
    { name: "Sorrow",             alias: "Low Sun IV",      days: 30 },
    { name: "Smolder",            alias: "Wind & Fire I",   days: 30 },
    { name: "Desert's Vengeance", alias: "Wind & Fire II",  days: 30 },
    { name: "Bloom",              alias: "Wind & Fire III", days: 30 },
    { name: "Embers",             alias: "Wind & Fire IV",  days: 30 },
  ],
  intercalaryDays: [
    { name: "Festival of the Highest Sun", afterMonth: 4,  description: "The scorching midpoint of High Sun, a brutal day when even the sorcerer-kings' templars retreat indoors. Gladiatorial games are held in shaded arenas." },
    { name: "Day of Rest",                 afterMonth: 8,  description: "The sole intercalary day all city-states observe. Even slave labour halts. Defilers and preservers alike feel the draw of the dying land on this day." },
    { name: "Storm's Crown",               afterMonth: 11, description: "The peak of Wind & Fire season; violent dust storms sweep the Tablelands. Caravans shelter and psions meditate on the Way amidst the howling dark." },
  ],
  // Ral and Guthay share a convention anchor (both full on 1 month 1 of 190). Three seasons from the month aliases.
  moons: [
    { name: "Ral", cycleDays: 33, fullOn: { year: 190, month: 1, day: 1 }, color: "#8fbf6a" },
    { name: "Guthay", cycleDays: 125, fullOn: { year: 190, month: 1, day: 1 }, color: "#e2b64c" },
  ],
  // `kind` is how the weather behaves, not the name: High Sun is the scorching peak (summer), Low Sun the easing
  // back (autumn), and Wind & Fire the mildest, storm-ridden stretch, which the arid table reads best as winter.
  seasons: [
    { name: "High Sun", kind: "summer", startsOn: { month: 1, day: 1 } },
    { name: "Low Sun", kind: "autumn", startsOn: { month: 5, day: 1 } },
    { name: "Wind & Fire", kind: "winter", startsOn: { month: 9, day: 1 } },
  ],
  leapYearRule: "none",
};
