/**
 * A D&D campaign setting is two plain-data halves (see SettingMeta and
 * SettingContentDef below), split so that a page downloads only the half it
 * needs. Everything is JSON-serializable; the calendar's functions (isLeapYear,
 * formatDate, weekdayOffset) are derived by calendarDefToAdapter().
 */

import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from "@/types/calendar.types";
import type { LocationType } from "@/types/location.types";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";

// ── Calendar ────────────────────────────────────────────────────────────────

export interface SettingMonthDef {
  name: string;
  alias?: string;
  days: number;
}

export interface SettingIntercalaryDef {
  name: string;
  /** Inserted after this 1-based month number. */
  afterMonth: number;
  description: string;
  isLeapOnly?: boolean;
}

export type LeapYearRule =
  | "none"         // no leap years
  | "every4"       // every year divisible by 4 (Faerûn / Harptos)
  | "gregorian";   // divisible by 4, except centuries unless also divisible by 400

export type WeekStyle =
  | "tenday"          // 10-day tendays (no weekday labels or offset)
  | "weekly"          // 7-day weeks, no calendar-grid offset (months start at col 0)
  | "weekly-offset";  // 7-day weeks, offset derived from JS Date (Gregorian real weekdays)

export interface SettingCalendarDef {
  /** Display name for the calendar picker — distinct from the setting label.
   *  e.g. "Faerûn (Calendar of Harptos)" */
  name: string;
  epochName: string;
  defaultYear: number;
  weekStyle: WeekStyle;
  /** Labels for each day of the week in weekly calendars, e.g. ["Mon","Tue",…].
   *  Array length determines the week size when weekStyle is "weekly" or "weekly-offset". */
  dayLabels?: string[];
  /** 3 row labels for tenday calendars, e.g. ["First Tenday",…] */
  weekRowNames?: [string, string, string];
  months: SettingMonthDef[];
  intercalaryDays: SettingIntercalaryDef[];
  leapYearRule: LeapYearRule;
}

// ── Atlas locations ─────────────────────────────────────────────────────────

export interface SettingLocationDef {
  name: string;
  location_type: LocationType;
  /** Name of another location in this same bundle that is this location's parent. */
  parent?: string;
  notes: string | null;
  tags: string[];
}

// ── Factions ─────────────────────────────────────────────────────────────────

export interface SettingFactionDef {
  name: string;
  /** Plain text — wrapped in Tiptap JSON on insert. */
  description: string;
  /** Must match a value from FACTION_TYPES in faction.types.ts. */
  faction_type: string | null;
  /** Must match a value from FACTION_ALIGNMENTS in faction.types.ts. */
  alignment: string | null;
  tags: string[];
}

// ── Deities & Pantheons ───────────────────────────────────────────────────────

export interface SettingPantheonDef {
  name: string;
  /** Plain text — wrapped in Tiptap JSON on insert. */
  description: string;
  tags: string[];
}

export interface SettingDeityDef {
  name: string;
  titles?: string;
  alternate_names?: string[];
  /** Must match a SettingPantheonDef.name from the same setting. */
  pantheon?: string;
  alignment?: string;
  /** Text description of the holy symbol. */
  symbol?: string;
  /** Cleric domain names from CLERIC_DOMAINS. */
  domains: string[];
  /** What the deity governs. */
  portfolio?: string;
  /** Plain text — wrapped in Tiptap JSON on insert. */
  description: string;
  tags: string[];
}

// ── Hall of Heroes seed entries ──────────────────────────────────────────────

export interface SettingHeroDef {
  name: string;
  race: string | null;
  alignment: string | null;
  occupation: string | null;
  personality: string | null;
  backstory: string | null;
  status: NpcStatus;
  relationship: NpcRelationship;
  /** Leave empty-string until the DM/admin provides an image. */
  portrait_url: string | null;
  tags: string[];
}

// ── Top-level setting definition ────────────────────────────────────────────

/** The light half of a setting: enough to list it in a picker and to build its
 *  calendar. Small and eager, so the dashboard and every calendar surface can
 *  read it synchronously without downloading a setting's seed content. */
export interface SettingMeta {
  id: string;
  label: string;
  calendar: SettingCalendarDef;
}

/** The heavy half: seed content that only the populate buttons and the AI
 *  prompt default read. One module per setting, fetched on demand. */
export interface SettingContentDef {
  /** Pre-filled into the campaign's AI Setting Prompt when this setting is selected.
   *  DMs can edit or overwrite it at any time. */
  defaultAiPrompt: string;
  locations: SettingLocationDef[];
  factions: SettingFactionDef[];
  heroes: SettingHeroDef[];
  pantheons: SettingPantheonDef[];
  deities: SettingDeityDef[];
}

// ── Derivation helpers ───────────────────────────────────────────────────────

/** Derives a full CalendarAdapter (with logic functions) from a plain SettingCalendarDef
 *  plus a stable id. Use this for runtime custom calendars (stored on a campaign as JSON)
 *  where there is no surrounding DndSettingDef. */
export function calendarDefToAdapter(id: string, c: SettingCalendarDef): CalendarAdapter {
  const months: CalendarMonth[] = c.months.map((m, i) => ({
    num: i + 1,
    name: m.name,
    alias: m.alias,
    days: m.days,
  }));

  const intercalaryDays: IntercalaryDay[] = c.intercalaryDays.map((d) => ({
    name: d.name,
    afterMonth: d.afterMonth,
    description: d.description,
    isLeapOnly: d.isLeapOnly,
  }));

  const isLeapYear: (year: number) => boolean =
    c.leapYearRule === "every4"
      ? (y) => y % 4 === 0
      : c.leapYearRule === "gregorian"
        ? (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
        : () => false;

  const weekdayOffset =
    c.weekStyle === "weekly-offset"
      ? (year: number, monthNum: number) => {
          const jsDay = new Date(year, monthNum - 1, 1).getDay(); // 0=Sun
          return (jsDay + 6) % 7; // Monday-first grid
        }
      : undefined;

  const weekSize =
    c.weekStyle === "tenday" ? 10 : (c.dayLabels?.length || 7);

  const ep = c.epochName;

  function formatDate(
    year: number,
    month: number | null,
    day: number | null,
    festivalDay: string | null,
  ): string {
    if (festivalDay) return `${festivalDay}, ${year} ${ep}`;
    if (month !== null && day !== null) {
      const m = months.find((mo) => mo.num === month);
      const monthName = m ? m.name : `Month ${month}`;
      if (c.weekStyle === "tenday") {
        const tenday = Math.ceil(day / 10);
        const dayInTenday = day - (tenday - 1) * 10;
        const rowLabel =
          c.weekRowNames?.[tenday - 1] ??
          (tenday === 1 ? "First Tenday" : tenday === 2 ? "Second Tenday" : "Third Tenday");
        return `Day ${dayInTenday} of ${rowLabel}, ${monthName}, ${year} ${ep}`;
      }
      const week = Math.ceil(day / weekSize);
      const dayInWeek = ((day - 1) % weekSize) + 1;
      return `Day ${dayInWeek} of Week ${week}, ${monthName}, ${year} ${ep}`;
    }
    return `${year} ${ep}`;
  }

  return {
    id,
    name: c.name,
    epochName: c.epochName,
    defaultYear: c.defaultYear,
    months,
    intercalaryDays,
    weekSize,
    dayLabels: c.dayLabels,
    weekRowNames: c.weekRowNames,
    weekdayOffset,
    isLeapYear,
    formatDate,
  };
}

/** A sensible starter SettingCalendarDef for the custom-calendar editor.
 *  Twelve 30-day months, weekly 7-day calendar, no leap years. */
export function createDefaultCustomCalendarDef(): SettingCalendarDef {
  return {
    name: "Custom Calendar",
    epochName: "AY",
    defaultYear: 1,
    weekStyle: "weekly",
    dayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    months: Array.from({ length: 12 }, (_, i) => ({
      name: `Month ${i + 1}`,
      days: 30,
    })),
    intercalaryDays: [],
    leapYearRule: "none",
  };
}
