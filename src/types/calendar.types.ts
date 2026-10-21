import type { AiProvenance } from "@/ai/provenance";

export interface HarptosDate {
  year: number;
  month: number | null; // null when it's a festival/intercalary day
  day: number | null; // null when it's a festival/intercalary day
  festival_day: string | null;
}

export type CalendarEventType =
  | "campaign"
  | "world"
  | "session"
  | "festival"
  | "deadline"
  | "player_death"
  | "boss_fight"
  | "discovery"
  | "npc_death"
  | "travel"
  | "quest"
  | "encounter"
  | "location";

export interface CalendarEvent {
  id: string;
  user_id: string;
  campaign_id: string | null;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  harptos_year: number;
  harptos_month: number | null;
  harptos_day: number | null;
  festival_day: string | null;
  is_multi_day: boolean;
  end_year: number | null;
  end_month: number | null;
  end_day: number | null;
  color: string;
  linked_quest_id: string | null;
  linked_encounter_id: string | null;
  linked_location_id: string | null;
  linked_note_id: string | null;
  travel_party_member_ids: string[];
  player_visible: boolean;
  /** Set when the event was drafted with AI; `edited` flips on a material change. */
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type LinkedEntityType = "quest" | "encounter" | "location";

/** Returns which entity type is linked, or null if it's a plain calendar event */
export function linkedEntityType(event: CalendarEvent): LinkedEntityType | null {
  if (event.linked_quest_id) return "quest";
  if (event.linked_encounter_id) return "encounter";
  if (event.linked_location_id) return "location";
  return null;
}

export function linkedEntityId(event: CalendarEvent): string | null {
  return event.linked_quest_id ?? event.linked_encounter_id ?? event.linked_location_id ?? null;
}

export const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  session:      "#C9920A", // gold
  quest:        "#7c3aed", // purple
  discovery:    "#059669", // green
  player_death: "#111827", // near-black
  boss_fight:   "#be123c", // crimson
  npc_death:    "#64748b", // slate
  travel:       "#0284c7", // sky blue
  encounter:    "#d97706", // amber
  location:     "#10b981", // emerald
  world:        "#0d9488", // teal
  festival:     "#ea580c", // orange
  deadline:     "#dc2626", // red
  campaign:     "#475569", // slate (generic catch-all)
};

/** Returns the canonical display color for a calendar event, by type. */
export function eventColor(event: Pick<CalendarEvent, "event_type">): string {
  return EVENT_TYPE_COLORS[event.event_type];
}

export type CalendarEventInsert = Omit<
  CalendarEvent,
  "id" | "user_id" | "created_at" | "updated_at" | "linked_note_id"
> & { linked_note_id?: string | null };
export type CalendarEventUpdate = Partial<CalendarEventInsert>;

// ── Adapter pattern types ──────────────────────────────────────────────────

export interface CalendarMonth {
  num: number;
  name: string;
  alias?: string;
  days: number;
}

export interface IntercalaryDay {
  name: string;
  afterMonth: number; // inserted after this month number
  description: string;
  isLeapOnly?: boolean; // true for Shieldmeet
}

/**
 * A day a moon is full: a dated day, or a festival (an intercalary day has a
 * name rather than a month and day). Lore often puts a full moon on a
 * festival (Selûne on Midwinter 1372 DR), so the anchor can say so directly.
 */
export type MoonAnchor =
  | { year: number; month: number; day: number }
  | { year: number; festival: string };

/**
 * A moon in the sky of a calendar's world (#1086).
 *
 * The cycle is anchored on one day the moon is full, and every other phase is
 * counted from there in whole in-world days (`daysBetween`, so intercalary
 * days and leap days elapse like any other).
 */
export interface CalendarMoon {
  name: string;
  /** Days from one full moon to the next. May be fractional (Selûne: 30.4375). */
  cycleDays: number;
  /** A day on which this moon is full. */
  fullOn: MoonAnchor;
  /** A CSS colour for the moon's lit face. Omitted means the default moon tone. */
  color?: string;
}

/**
 * A season of a calendar's year (#1086). It begins on `startsOn` and lasts
 * until the next season in the list begins, wrapping round the year end, so a
 * calendar's seasons always cover every day, festivals included.
 */
export interface CalendarSeason {
  name: string;
  startsOn: { month: number; day: number };
  /** What the weather does in this season (#1086). Omitted reads as "spring":
   *  middling, neither the year's warmest nor its coldest. */
  kind?: SeasonKind;
}

/** The four temperate seasons, which is all the weather tables need to know
 *  about a season whatever the calendar calls it (Athas's "High Sun" is a summer). */
export type SeasonKind = "spring" | "summer" | "autumn" | "winter";
export const SEASON_KINDS: readonly SeasonKind[] = ["spring", "summer", "autumn", "winter"];

/**
 * A place's climate for the weather (#1086): `campaigns.climate` is the
 * default, `locations.climate` overrides it for a place and everything inside
 * it. "underground" has no weather at all. Mirrors the check constraints in
 * migration 20261021164506.
 */
export type Climate = "polar" | "cold" | "temperate" | "warm" | "tropical" | "arid" | "underground";
export const CLIMATES: readonly Climate[] = ["polar", "cold", "temperate", "warm", "tropical", "arid", "underground"];

export interface CalendarAdapter {
  id: string; // e.g. "faerun", "greyhawk"
  name: string; // display name, e.g. "Faerûn (Calendar of Harptos)"
  epochName: string; // e.g. "DR" (Dale Reckoning)
  defaultYear: number;
  months: CalendarMonth[];
  intercalaryDays: IntercalaryDay[];
  /** Days per "row" in the calendar grid — 10 for Harptos tendays, 7 for week-based calendars */
  weekSize: number;
  /** Optional labels for each column (e.g. Mon/Tue/… for Gregorian). Omit for tenday calendars. */
  dayLabels?: string[];
  /** Optional custom row labels (e.g. "First Tenday"). Defaults to "Week 1", "Week 2", … */
  weekRowNames?: string[];
  /** For Gregorian-style grids: returns how many empty cells to show before day 1 (0-based weekday). */
  weekdayOffset?: (year: number, monthNum: number) => number;
  /**
   * How many days a month actually has in a given year, when that is not
   * simply `months[n-1].days`.
   *
   * Only Gregorian needs it: it folds its leap day into February. Every
   * fantasy calendar here puts its leap day in an **intercalary** day instead
   * — Harptos's Shieldmeet sits after month 7 — so their months are fixed and
   * they omit this.
   *
   * It exists because `CalendarGrid` used to answer the question itself with
   * `month === 2 && adapter.isLeapYear(year) ? 29 : month.days`, applied to
   * *every* adapter. On Harptos, whose leap rule is `every4`, that silently
   * rendered Ches with 29 cells in every year divisible by four — including
   * 1492 DR, the default — and the 30th of Ches could not be reached in the
   * grid at all. A calendar-specific rule belongs to the calendar.
   */
  daysInMonth?: (year: number, monthNum: number) => number;
  /** The world's moons; empty for a sky without one (Sigil). */
  moons: CalendarMoon[];
  /** The year's seasons in calendar order; empty when the calendar names none. */
  seasons: CalendarSeason[];
  isLeapYear: (year: number) => boolean;
  formatDate: (
    year: number,
    month: number | null,
    day: number | null,
    festivalDay: string | null,
  ) => string;
}
