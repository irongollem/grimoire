import { calendarDefToAdapter, type SettingCalendarDef } from "@/settings/types";
import { moonAnchorOrdinal } from "./moons";

/**
 * What is wrong with a custom calendar, in words a DM can act on, or null when
 * it is sound. The editor shows it, and every form that saves the calendar
 * (campaign settings, new campaign) refuses to while it is non-null: the
 * definition is stored as JSON on `campaigns.custom_calendar`, so nothing
 * downstream would catch a month of no days or a moon anchored on 31 Ches.
 *
 * A cleared number input reads back as null, which the integer and finite
 * checks reject, so a blank field never reaches the database either.
 */
export function customCalendarProblem(def: SettingCalendarDef): string | null {
  if (!def.name.trim()) return "Calendar name is required.";
  if (!def.epochName.trim()) return "Epoch is required (e.g. \"AY\").";
  if (def.months.length === 0) return "At least one month is required.";
  if (def.months.some((m) => !m.name.trim())) return "Every month needs a name.";
  if (def.months.some((m) => !Number.isInteger(m.days) || m.days < 1)) return "Every month needs at least 1 day.";

  const moons = def.moons ?? [];
  if (moons.some((m) => !m.name.trim())) return "Every moon needs a name.";
  if (moons.some((m) => !(typeof m.cycleDays === "number" && Number.isFinite(m.cycleDays) && m.cycleDays > 0))) {
    return "Every moon needs a cycle longer than 0 days.";
  }
  const adapter = calendarDefToAdapter("custom", def);
  const badAnchor = moons.find((m) => moonAnchorOrdinal(adapter, m.fullOn) === undefined);
  if (badAnchor) return `The full-moon day of ${badAnchor.name.trim()} is not a day in this calendar.`;

  const seasons = def.seasons ?? [];
  if (seasons.some((s) => !s.name.trim())) return "Every season needs a name.";
  const badSeason = seasons.find((s) => {
    const { month, day } = s.startsOn;
    const mo = Number.isInteger(month) ? def.months[month - 1] : undefined;
    return !mo || !Number.isInteger(day) || day < 1 || day > mo.days;
  });
  if (badSeason) return `The start of ${badSeason.name.trim()} is not a day in this calendar.`;
  return null;
}
