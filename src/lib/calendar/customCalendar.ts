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
  // Two seasons on one day leave the first unreachable: the later in the list always wins.
  const starts = new Set<string>();
  for (const s of seasons) {
    const key = `${s.startsOn.month}/${s.startsOn.day}`;
    if (starts.has(key)) return `${s.name.trim()} starts on the same day as another season.`;
    starts.add(key);
  }
  return null;
}

/**
 * The calendar with month `index` (0-based) taken out, every month reference
 * renumbered to match. Removing month 2 of four makes the old month 3 the new
 * month 2, so festivals, moon anchors and season starts that named it follow
 * it there; one that named the removed month moves to the month before it (or
 * to the new first month), its day clamped to that month's length. Leaving the
 * numbers alone would silently re-point every later reference at the month
 * after the one it meant.
 */
export function withoutMonth(def: SettingCalendarDef, index: number): SettingCalendarDef {
  if (index < 0 || index >= def.months.length) return def;
  const removed = index + 1;
  const months = def.months.filter((_, i) => i !== index);
  const remap = (m: number) => (m < removed ? m : m > removed ? m - 1 : Math.max(1, removed - 1));
  const clampDay = (month: number, day: number) => Math.min(day, months[month - 1]?.days ?? day);

  return {
    ...def,
    months,
    intercalaryDays: def.intercalaryDays.map((d) => ({ ...d, afterMonth: Math.max(1, remap(d.afterMonth)) })),
    moons: def.moons?.map((moon) => {
      const anchor = moon.fullOn;
      if ("festival" in anchor || !Number.isInteger(anchor.month)) return moon;
      const month = remap(anchor.month);
      return { ...moon, fullOn: { ...anchor, month, day: clampDay(month, anchor.day) } };
    }),
    seasons: def.seasons?.map((season) => {
      const { month: m, day } = season.startsOn;
      if (!Number.isInteger(m)) return season;
      const month = remap(m);
      return { ...season, startsOn: { month, day: clampDay(month, day) } };
    }),
  };
}
