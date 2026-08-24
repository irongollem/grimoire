import type { CalendarAdapter, CalendarEvent, CalendarEventType } from "@/types/calendar.types";

/**
 * "Next N upcoming events" for the DM dashboard (#764) — and, per the module
 * placement rule for single-feature logic that more than one feature could
 * reasonably want, anything else that ever needs the same query. Nothing in
 * the app already answers "what's next": `useCalendarEventsRange` only fetches
 * a year window, and every place that turns a date into an orderable position
 * does it locally and approximately, because each of them only ever needed
 * *relative* position on a screen, not an exact day count —
 * `CalendarTimeline.vue`'s `eventToFrac` (L466-482) flattens every month to a
 * nominal 30 days to place a pixel on an axis, which is fine for a timeline
 * ruler and wrong for a countdown. A countdown needs the exact count, so this
 * module is the first place that walks a `CalendarAdapter`'s real month
 * lengths and intercalary days to produce one.
 */

/**
 * The campaign's in-world "now". Deliberately narrower than `HarptosDate`:
 * a campaign's `current_year`/`current_month`/`current_day` columns are all
 * `NOT NULL` (see `Campaign` in `campaign.types.ts`, and how
 * `useCampaignStore().todayYear/todayMonth/todayDay` — `src/stores/campaign.ts`
 * L177-179 — expose them) — a campaign can never be "currently on a festival
 * day" the way an *event* can, so this type has no `festival_day` slot that
 * would only ever be null.
 */
export interface CalendarToday {
  year: number;
  month: number;
  day: number;
}

export interface UpcomingCalendarEvent {
  event: CalendarEvent;
  /** Whole in-world days from `today` to the event's start. 0 = today. Never
   *  negative — `nextUpcomingEvents` has already dropped anything in the past. */
  daysUntil: number;
}

export interface UpcomingEventsOptions {
  /** Only events of these types. Omit, or pass an empty list, for every type. */
  eventTypes?: readonly CalendarEventType[];
  /** How many events to return, earliest first. */
  limit: number;
}

/**
 * One calendar year's days, in true calendrical order: each month's declared
 * length (`adapter.months[i].days`), plus each adapter-defined intercalary day
 * slotted in immediately after the month it names (`afterMonth`), in the order
 * the adapter lists them — which is how two festivals sharing an `afterMonth`
 * (Midsummer then Shieldmeet in Harptos) get a stable relative order. An
 * `isLeapOnly` day (Shieldmeet) is included only when `adapter.isLeapYear` says
 * this particular year actually has it.
 *
 * Every adapter currently in the registry keeps a month's length fixed
 * regardless of year — Harptos leap years add a day via Shieldmeet, an
 * intercalary day, rather than lengthening a month. Gregorian's February is
 * the one real-world exception, and nothing that already tracks a campaign's
 * "today" accounts for it either: `SessionWidget.vue`'s day-advance control
 * (`src/components/dashboard/widgets/SessionWidget.vue` L139, L154) reads the
 * same fixed `.days` value with no leap adjustment. Matching that here — not
 * inventing a more "correct" rule this module alone would follow — keeps this
 * module's arithmetic agreeing with the one control that actually moves the
 * campaign's calendar forward.
 */
function buildYearIndex(
  adapter: CalendarAdapter,
  year: number,
): { monthStartOrdinal: number[]; festivalOrdinals: Map<string, number>; totalDays: number } {
  const monthStartOrdinal: number[] = [];
  const festivalOrdinals = new Map<string, number>();
  let cursor = 0;
  for (let month = 1; month <= adapter.months.length; month++) {
    monthStartOrdinal[month - 1] = cursor;
    cursor += adapter.months[month - 1].days;
    for (const intercalary of adapter.intercalaryDays) {
      if (intercalary.afterMonth !== month) continue;
      if (intercalary.isLeapOnly && !adapter.isLeapYear(year)) continue;
      cursor += 1;
      festivalOrdinals.set(intercalary.name, cursor);
    }
  }
  return { monthStartOrdinal, festivalOrdinals, totalDays: cursor };
}

/**
 * A date's 1-based position within its own year, per `buildYearIndex`.
 * `undefined` for a date `buildYearIndex` has no slot for: a festival name the
 * adapter doesn't declare (a leap-only day in a non-leap year, or a festival
 * left over from a calendar the campaign has since switched away from), a
 * month outside the adapter's range, or a row with neither a dated day nor a
 * festival name. Every case is real, corrupted-by-migration data rather than
 * a bug to throw on — mirrors `dmScreenCard.ts`'s `parseDmScreenCardSettings`,
 * which resolves an unrecognisable stored value instead of crashing the widget.
 */
function ordinalWithinYear(
  adapter: CalendarAdapter,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
): number | undefined {
  if (festivalDay !== null) return buildYearIndex(adapter, year).festivalOrdinals.get(festivalDay);
  if (month === null || day === null) return undefined;
  if (month < 1 || month > adapter.months.length) return undefined;
  return buildYearIndex(adapter, year).monthStartOrdinal[month - 1] + day;
}

/**
 * Whole days from one (year, ordinal-within-year) position to another. Walks
 * whole years rather than a flat `year * 365 + ordinal` formula, because
 * adjacent years are not the same length here (a leap year carries an extra
 * intercalary day) — the flat formula is exactly the bug this module exists to
 * avoid, just moved one level up.
 */
function daysBetween(
  adapter: CalendarAdapter,
  fromYear: number,
  fromOrdinal: number,
  toYear: number,
  toOrdinal: number,
): number {
  if (fromYear === toYear) return toOrdinal - fromOrdinal;
  if (toYear < fromYear) return -daysBetween(adapter, toYear, toOrdinal, fromYear, fromOrdinal);
  let days = buildYearIndex(adapter, fromYear).totalDays - fromOrdinal;
  for (let year = fromYear + 1; year < toYear; year++) {
    days += buildYearIndex(adapter, year).totalDays;
  }
  return days + toOrdinal;
}

/**
 * The next `options.limit` events at or after `today`, earliest first, each
 * with the exact number of in-world days until it starts. Past events are
 * dropped; an event whose date `ordinalWithinYear` cannot place (see its own
 * doc comment) is dropped rather than sorted arbitrarily.
 */
export function nextUpcomingEvents(
  events: readonly CalendarEvent[],
  adapter: CalendarAdapter,
  today: CalendarToday,
  options: UpcomingEventsOptions,
): UpcomingCalendarEvent[] {
  const { eventTypes, limit } = options;
  const typeFilter = eventTypes && eventTypes.length > 0 ? new Set(eventTypes) : null;

  const todayOrdinal = ordinalWithinYear(adapter, today.year, today.month, today.day, null);
  // `today` is always a dated day (see `CalendarToday`'s doc comment), so this
  // is only ever undefined if `today.month`/`today.day` sit outside the active
  // adapter's own month range — which would mean the campaign's stored date
  // predates a switch to a smaller calendar. Nothing sensible can be counted
  // from an unplaceable "now", so nothing is upcoming.
  if (todayOrdinal === undefined) return [];

  const withDays: UpcomingCalendarEvent[] = [];
  for (const event of events) {
    if (typeFilter && !typeFilter.has(event.event_type)) continue;
    const eventOrdinal = ordinalWithinYear(
      adapter,
      event.harptos_year,
      event.harptos_month,
      event.harptos_day,
      event.festival_day,
    );
    if (eventOrdinal === undefined) continue;
    const daysUntil = daysBetween(adapter, today.year, todayOrdinal, event.harptos_year, eventOrdinal);
    if (daysUntil < 0) continue;
    withDays.push({ event, daysUntil });
  }

  // Array#sort is stable (guaranteed since ES2019), so same-day events keep
  // the order they arrived in rather than being reshuffled on every call.
  withDays.sort((a, b) => a.daysUntil - b.daysUntil);
  return withDays.slice(0, Math.max(0, limit));
}

/**
 * "In 6 days" wording for the deadline countdown — the same phrasing
 * `NextSessionWidget` already uses for the (unrelated) real-world session
 * date, so the dashboard doesn't speak two dialects of the same idea.
 */
export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil <= 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}
