import type { SettingCalendarDef } from "./types";

export const PLANESCAPE_CALENDAR: SettingCalendarDef = {
  name: "Planescape (Planar Common Reckoning)",
  epochName: "PCR",
  defaultYear: 570,
  weekStyle: "weekly",
  dayLabels: ["Prime", "Bleaker", "Guvner", "Cipher", "Signer", "Sensate", "Deadday"],
  months: [
    { name: "Primum",     alias: "The Opening",     days: 30 },
    { name: "Internum",   alias: "The Seeking",     days: 30 },
    { name: "Tertium",    alias: "The Debating",    days: 30 },
    { name: "Quartum",    alias: "The Arguing",     days: 30 },
    { name: "Quintum",    alias: "The Reckoning",   days: 30 },
    { name: "Sextum",     alias: "The Convergence", days: 30 },
    { name: "Septimum",   alias: "The Midtide",     days: 30 },
    { name: "Octavum",    alias: "The Wandering",   days: 30 },
    { name: "Nonum",      alias: "The Returning",   days: 30 },
    { name: "Decimum",    alias: "The Closing",     days: 30 },
    { name: "Undecimum",  alias: "The Silence",     days: 30 },
    { name: "Duodecimum", alias: "The Reckoning",   days: 30 },
  ],
  intercalaryDays: [
    { name: "Day of Factions",   afterMonth: 3,  description: "A day when the great factions of Sigil hold open debates in the Hall of Speakers. Recruitment is aggressive; newcomers are wise to choose a side." },
    { name: "Great Bazaar Day",  afterMonth: 6,  description: "A planar market day when portals to every known trading plane cycle open in the Great Bazaar. The most exotic goods in the multiverse change hands." },
    { name: "Day of the Lady",   afterMonth: 9,  description: "A day of enforced quiet in Sigil. No faction meetings. No public violence. The Lady of Pain's dabus scrub the streets. No one asks why." },
    { name: "Convergence",       afterMonth: 12, description: "The year's end festival, when planar travellers across the multiverse gather debts, settle old scores, and begin new ventures." },
  ],
  leapYearRule: "none",
};
