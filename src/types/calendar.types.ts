export interface HarptosDate {
  year: number
  month: number | null       // null when it's a festival/intercalary day
  day: number | null         // null when it's a festival/intercalary day
  festival_day: string | null
}

export type CalendarEventType = 'campaign' | 'world' | 'session' | 'festival' | 'deadline'

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  event_type: CalendarEventType
  harptos_year: number
  harptos_month: number | null
  harptos_day: number | null
  festival_day: string | null
  is_multi_day: boolean
  end_year: number | null
  end_month: number | null
  end_day: number | null
  color: string
  created_at: string
  updated_at: string
}

export type CalendarEventInsert = Omit<CalendarEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type CalendarEventUpdate = Partial<CalendarEventInsert>

// ── Adapter pattern types ──────────────────────────────────────────────────

export interface CalendarMonth {
  num: number
  name: string
  alias?: string
  days: number
}

export interface IntercalaryDay {
  name: string
  afterMonth: number      // inserted after this month number
  description: string
  isLeapOnly?: boolean    // true for Shieldmeet
}

export interface CalendarAdapter {
  id: string              // e.g. "faerun", "greyhawk"
  name: string            // display name, e.g. "Faerûn (Calendar of Harptos)"
  epochName: string       // e.g. "DR" (Dale Reckoning)
  defaultYear: number
  months: CalendarMonth[]
  intercalaryDays: IntercalaryDay[]
  isLeapYear: (year: number) => boolean
  formatDate: (
    year: number,
    month: number | null,
    day: number | null,
    festivalDay: string | null
  ) => string
}
