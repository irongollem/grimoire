import type { CalendarAdapter } from "@/types/calendar.types";
import { daysFromTo, type CalendarDate } from "@/lib/calendar/dayMath";
import type { QuestObjective } from "@/types/quest.types";

/**
 * Objective due dates (#1011). An in-world date, all three columns or none;
 * when the campaign date moves past it (inclusive: due the 14th fails on the
 * 15th) the server fails a still-pending objective of an active quest. These
 * helpers only say how far away that is; the failing itself is server-side.
 */

export type DeadlineUrgency = "overdue" | "today" | "soon" | "later";

export interface DeadlineSummary {
  /** "due 14 Ches", "due tomorrow", "due today" or "overdue". */
  label: string;
  urgency: DeadlineUrgency;
}

/** Within this many in-world days a deadline is flagged as close. */
export const DEADLINE_SOON_DAYS = 3;

export function objectiveDueDate(
  objective: Pick<QuestObjective, "due_year" | "due_month" | "due_day">,
): CalendarDate | null {
  const { due_year: year, due_month: month, due_day: day } = objective;
  if (year === null || month === null || day === null) return null;
  return { year, month, day };
}

/** "14 Ches": day plus the month's short name (its alias when it has one). */
export function formatDueDate(adapter: CalendarAdapter, date: CalendarDate): string {
  const month = adapter.months[date.month - 1];
  const name = month ? month.alias || month.name : `month ${date.month}`;
  return `${date.day} ${name}`;
}

/**
 * How a due date reads against today. `null` for an unplaceable date, which is
 * a corrupt stored value rather than something worth guessing a label for.
 */
export function describeDeadline(
  adapter: CalendarAdapter,
  due: CalendarDate,
  today: CalendarDate,
): DeadlineSummary | null {
  const days = daysFromTo(adapter, today, due);
  if (days === undefined) return null;
  if (days < 0) return { label: "overdue", urgency: "overdue" };
  if (days === 0) return { label: "due today", urgency: "today" };
  if (days === 1) return { label: "due tomorrow", urgency: "soon" };
  return {
    label: `due ${formatDueDate(adapter, due)}`,
    urgency: days <= DEADLINE_SOON_DAYS ? "soon" : "later",
  };
}
