import type { SettingCalendarDef } from "./types";

export const SPELLJAMMER_CALENDAR: SettingCalendarDef = {
  name: "Spelljammer (Bral Standard Year)",
  epochName: "SY",
  defaultYear: 5048,
  weekStyle: "weekly",
  dayLabels: ["Helm", "Keel", "Mast", "Rig", "Void", "Port", "Star"],
  months: [
    { name: "Starrise",   alias: "New Voyage",     days: 30 },
    { name: "Coldvoid",   alias: "The Long Dark",  days: 30 },
    { name: "Windtack",   alias: "Sailing Season", days: 30 },
    { name: "Brightburn", alias: "Sun-Facing",     days: 30 },
    { name: "Spelltide",  alias: "The Convergence",days: 30 },
    { name: "Higharch",   alias: "Midsphere",      days: 30 },
    { name: "Driftmonth", alias: "The Quiet Drift",days: 30 },
    { name: "Emberfall",  alias: "Cooling Season", days: 30 },
    { name: "Stargather", alias: "The Counting",   days: 30 },
    { name: "Grayreach",  alias: "The Long Haul",  days: 30 },
    { name: "Deepvoid",   alias: "Dead Reckoning", days: 30 },
    { name: "Returntide", alias: "Homeport",       days: 30 },
  ],
  intercalaryDays: [
    { name: "Void Day",                afterMonth: 3,  description: "A traditional rest day observed by Spelljammer crews: no navigation, no cargo handling. Ships drift and crews share stories of distant spheres." },
    { name: "Great Market",            afterMonth: 6,  description: "The annual festival on the Rock of Bral. Ships from dozens of crystal spheres gather to trade, race spelljammers, and seek new crew." },
    { name: "Night of Shooting Stars", afterMonth: 9,  description: "A single night when an unusual number of meteors streak across every crystal sphere. Navigators use it to verify star charts." },
  ],
  leapYearRule: "none",
};
