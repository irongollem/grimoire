import type { SettingCalendarDef } from "./types";

export const FAERUN_CALENDAR: SettingCalendarDef = {
  name: "Faerûn (Calendar of Harptos)",
  epochName: "DR",
  defaultYear: 1495,
  weekStyle: "tenday",
  weekRowNames: ["Tenday 1", "Tenday 2", "Tenday 3"],
  months: [
    { name: "Hammer",    alias: "Deepwinter",             days: 30 },
    { name: "Alturiak",  alias: "The Claw of Winter",     days: 30 },
    { name: "Ches",      alias: "The Claw of the Sunsets",days: 30 },
    { name: "Tarsakh",   alias: "The Claw of the Storms", days: 30 },
    { name: "Mirtul",    alias: "The Melting",            days: 30 },
    { name: "Kythorn",   alias: "The Time of Flowers",    days: 30 },
    { name: "Flamerule", alias: "Summertide",             days: 30 },
    { name: "Eleasias",  alias: "Highsun",                days: 30 },
    { name: "Eleint",    alias: "The Fading",             days: 30 },
    { name: "Marpenoth", alias: "Leaffall",               days: 30 },
    { name: "Uktar",     alias: "The Rotting",            days: 30 },
    { name: "Nightal",   alias: "The Drawing Down",       days: 30 },
  ],
  intercalaryDays: [
    { name: "Midwinter",        afterMonth: 1,  description: "A mid-winter festival of introspection and planning for the year ahead." },
    { name: "Greengrass",       afterMonth: 4,  description: "A spring celebration welcoming warmer weather and new beginnings." },
    { name: "Midsummer",        afterMonth: 7,  description: "A summer festival of revelry, romance, and celebration." },
    { name: "Shieldmeet",       afterMonth: 7,  description: "A leap day occurring every four years, immediately after Midsummer. A time for solemn oaths and great deeds.", isLeapOnly: true },
    { name: "Highharvestide",   afterMonth: 9,  description: "An autumn harvest festival of feasting and thanks." },
    { name: "Feast of the Moon",afterMonth: 11, description: "A solemn festival to honour the dead and remember those who have passed." },
  ],
  leapYearRule: "every4",
};
