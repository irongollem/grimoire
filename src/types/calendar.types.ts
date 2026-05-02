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
  isLeapYear: (year: number) => boolean;
  formatDate: (
    year: number,
    month: number | null,
    day: number | null,
    festivalDay: string | null,
  ) => string;
}
