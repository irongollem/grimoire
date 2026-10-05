import type { CalendarToday } from "@/lib/calendar/upcoming";
import type { CalendarAdapter, CalendarEvent } from "@/types/calendar.types";

/**
 * The calendar strip on the player Hearth: the week (or tenday) row holding the
 * campaign's in-world today. The next events come from `nextUpcomingEvents`. The row rule is
 * `CalendarGrid.vue`'s `gridRows`, mirrored on purpose: cells are laid out
 * from `weekdayOffset` (0 when the adapter has none), rows are `weekSize`
 * wide, and the row is clipped to the month so a Gregorian month that starts
 * mid-week gets a short first row rather than days of another month.
 */

export interface HearthWeekDay {
  day: number;
  isToday: boolean;
  hasEvent: boolean;
}

export interface HearthWeek {
  /** "Tenday 2", "Week 3" or the adapter's own `weekRowNames` entry. */
  label: string;
  days: HearthWeekDay[];
}

type WeekAdapter = Pick<
  CalendarAdapter,
  "months" | "weekSize" | "weekdayOffset" | "daysInMonth" | "weekRowNames"
>;

/** Mirrors CalendarGrid's `dayIsInEvent`, extended with the year so a stored
 *  event in another year never marks this month. Festival days and events
 *  without a month and day are not on a dated cell. */
function eventCoversDay(event: CalendarEvent, year: number, month: number, day: number): boolean {
  if (event.festival_day) return false;
  const { harptos_month: startMonth, harptos_day: startDay } = event;
  if (startMonth === null || startDay === null) return false;
  const here = year * 10_000 + month * 100 + day;
  const start = event.harptos_year * 10_000 + startMonth * 100 + startDay;
  if (!event.is_multi_day || event.end_day === null) return here === start;
  const endYear = event.end_year ?? event.harptos_year;
  const endMonth = event.end_month ?? startMonth;
  return here >= start && here <= endYear * 10_000 + endMonth * 100 + event.end_day;
}

function rowLabel(adapter: WeekAdapter, rowIdx: number): string {
  const named = adapter.weekRowNames?.[rowIdx];
  if (named) return named;
  return `${adapter.weekSize === 10 ? "Tenday" : "Week"} ${rowIdx + 1}`;
}

/**
 * The row containing `today`, or null when `today.month` is not a month of the
 * adapter (a stored date from a calendar the campaign switched away from).
 */
export function weekContainingToday(
  adapter: WeekAdapter,
  today: CalendarToday,
  events: readonly CalendarEvent[],
): HearthWeek | null {
  const month = adapter.months[today.month - 1];
  if (!month) return null;
  const monthDays = adapter.daysInMonth?.(today.year, today.month) ?? month.days;
  const offset = adapter.weekdayOffset?.(today.year, today.month) ?? 0;
  const size = adapter.weekSize;
  if (today.day < 1 || today.day > monthDays || size < 1) return null;

  const rowIdx = Math.floor((offset + today.day - 1) / size);
  const first = Math.max(1, rowIdx * size - offset + 1);
  const last = Math.min(monthDays, (rowIdx + 1) * size - offset);
  const days: HearthWeekDay[] = [];
  for (let day = first; day <= last; day++) {
    days.push({
      day,
      isToday: day === today.day,
      hasEvent: events.some((e) => eventCoversDay(e, today.year, today.month, day)),
    });
  }
  return { label: rowLabel(adapter, rowIdx), days };
}
