import type { CalendarAdapter, CalendarEvent, CalendarEventType } from "@/types/calendar.types";
import { daysBetween, ordinalWithinYear } from "./dayMath";

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
