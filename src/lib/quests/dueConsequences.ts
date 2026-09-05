import type { CalendarAdapter } from "@/types/calendar.types";
import { addDays, isOnOrBefore, type CalendarDate } from "@/lib/calendar/dayMath";

/** The subset of a `quest_consequence_events` row the due-check needs. See
 *  that table's own column comment: "a row with `performed_at is null and
 *  undone_at is null and after_days > 0` is waiting for its in-world date." */
export interface PendingConsequenceEvent {
  id: string;
  after_days: number;
  fires_on_year: number;
  fires_on_month: number;
  fires_on_day: number;
}

/**
 * Every pending event whose `fires_on + after_days` has arrived, given
 * `today`. Pulled out of `useDueConsequences` for the usual reason: cheap to
 * test here, expensive to test through a mounted watcher — see
 * `lib/dashboard/questTriggers.ts`, this module's dashboard-widget sibling,
 * for the same argument.
 */
export function dueConsequenceEvents(
  adapter: CalendarAdapter,
  rows: readonly PendingConsequenceEvent[],
  today: CalendarDate,
): PendingConsequenceEvent[] {
  return rows.filter((row) => {
    const dueOn = addDays(
      adapter,
      { year: row.fires_on_year, month: row.fires_on_month, day: row.fires_on_day },
      row.after_days,
    );
    return isOnOrBefore(adapter, dueOn, today);
  });
}
