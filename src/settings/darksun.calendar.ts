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
  leapYearRule: "none",
};
