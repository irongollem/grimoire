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
  | "travel";

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
  created_at: string;
  updated_at: string;
}

export type CalendarEventInsert = Omit<
  CalendarEvent,
  "id" | "user_id" | "created_at" | "updated_at"
>;
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
