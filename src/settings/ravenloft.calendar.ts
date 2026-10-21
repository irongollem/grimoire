import type { SettingCalendarDef } from "./types";

export const RAVENLOFT_CALENDAR: SettingCalendarDef = {
  name: "Ravenloft (Barovian Calendar)",
  epochName: "BC",
  defaultYear: 735,
  weekStyle: "weekly",
  dayLabels: ["Moonday", "Grimday", "Ashenday", "Bleakday", "Dreadday", "Wailday", "Darkday"],
  months: [
    { name: "Deadwinter",  alias: "The Long Dark",  days: 30 },
    { name: "Witchblight", alias: "The Rime",        days: 30 },
    { name: "Thawing",     alias: "False Spring",    days: 30 },
    { name: "Bloodrose",   alias: "Blooming",        days: 30 },
    { name: "Mourning",    alias: "The Weeping",     days: 30 },
    { name: "Mistmonth",   alias: "High Summer",     days: 30 },
    { name: "Swelter",     alias: "The Fever",       days: 30 },
    { name: "Duskfall",    alias: "The Turning",     days: 30 },
    { name: "Darkening",   alias: "The Long Dusk",   days: 30 },
    { name: "Harvestwane", alias: "Last Harvest",    days: 30 },
    { name: "Grimtide",    alias: "The Reckoning",   days: 30 },
    { name: "Deepmist",    alias: "The Vanishing",   days: 30 },
  ],
  intercalaryDays: [
    {
      name: "Mistsday",
      afterMonth: 6,
      description: "The longest night of summer. The Mists draw close and the boundary between life and death blurs. Darklords are said to be at their most powerful.",
    },
    {
      name: "Night of the Walking Dead",
      afterMonth: 12,
      description: "The most dreaded night in Ravenloft: the dead rise from their graves and the Mists swallow entire villages. No one ventures out alone.",
    },
  ],
  // Lore gives no moon cycle; a plain 28-day moon anchored on a convention date. Seasons are a convention.
  moons: [
    { name: "The Moon", cycleDays: 28, fullOn: { year: 735, month: 1, day: 15 }, color: "#e4dfd2" },
  ],
  seasons: [
    { name: "Spring", kind: "spring", startsOn: { month: 3, day: 1 } },
    { name: "Summer", kind: "summer", startsOn: { month: 6, day: 1 } },
    { name: "Autumn", kind: "autumn", startsOn: { month: 9, day: 1 } },
    { name: "Winter", kind: "winter", startsOn: { month: 12, day: 1 } },
  ],
  leapYearRule: "none",
};
