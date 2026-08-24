import type { TriggerType } from "@/types/quest.types";
import type { CalendarToday } from "@/lib/calendar/upcoming";

/**
 * The "about to fire" join for the "Quest triggers due" widget (#764).
 *
 * A `quest_trigger` is a DM-authored consequence — "when [quest completes /
 * objective X is done], N days later, [create a calendar event / send a
 * broadcast]" (`QuestTriggersPanel.vue`, the "Consequences" list). It only
 * becomes a *scheduled* fire instance — a `quest_trigger_scheduled` row —
 * once its qualifying event has actually happened: `scheduleQuestTriggers`
 * (src/composables/useQuests.ts:541) is called from the three places a quest
 * completes or an objective is checked off, and stamps a `fire_year/month/day`
 * computed from the in-world day it fired on plus `offset_days`. So every row
 * this module ever sees already cleared its condition — "waiting for the
 * event" and "waiting for the date" are the same list, at two different
 * distances from now, which is why one widget covers both:
 *
 * - `offset_days > 0` ("time" trigger) — a real calendar wait remains. Shown
 *   with a countdown, and dropped once that countdown exceeds the horizon —
 *   a fire date three story arcs out is not "about to fire".
 * - `offset_days === 0` ("event" trigger) — nothing left to wait on; its fire
 *   date is the day it was scheduled, which can only be today or earlier. A
 *   countdown here would always read "Today" and say nothing, so this widget
 *   describes it by the condition that just fired it instead, and never
 *   horizon-excludes it — it is already as close as a row gets.
 *
 * Kept pure and apart from the widget for the usual dashboard reason (see
 * `dmScreenCard.ts`, `downtimeQueue.ts`): the join, the due/horizon check and
 * the "gone" guards are cheap to test here and expensive to test through a
 * mounted card.
  *
 * The mirrored arithmetic is tracked as #766 — fixing it moves when triggers
 * actually fire, so it is a decision of its own rather than something a
 * dashboard card changes on the way past.
 */

/**
 * One `quest_trigger_scheduled` row as the widget fetches it: the scheduled
 * row's own date fields plus its trigger and quest, embedded in a single
 * Supabase query (mirroring the `trigger:quest_triggers(*)` embed
 * `fireDueTriggers` already selects — useQuests.ts:667-668 — extended with
 * the `quest` and `objective` embeds this widget also needs).
 *
 * `trigger`/`quest` are `null` when the row they reference is gone: a
 * dangling scheduled row (its trigger was deleted — the same case
 * `fireDueTriggers`'s own `FiringTrigger` guard exists for, useQuests.ts:582)
 * or an orphaned one (its quest was deleted). Both are dropped rather than
 * rendered — see `deriveQuestTriggerDueRows`.
 */
export interface ScheduledTriggerRow {
  id: string;
  fire_year: number;
  fire_month: number;
  fire_day: number;
  fired_at: string | null;
  quest: { id: string; title: string } | null;
  trigger: {
    trigger_type: TriggerType;
    offset_days: number;
    /** Only set for an `objective_done` trigger, and only when the objective
     *  it names still exists — `quest_triggers.objective_id` cascades on
     *  delete, so in practice this is null exactly when `trigger_type` is
     *  `quest_complete`, but a missing description is handled the same way
     *  a missing quest title is: a marker, never a blank line. */
    objective: { description: string } | null;
  } | null;
}

export interface QuestTriggerDueRow {
  scheduledId: string;
  questId: string;
  questTitle: string;
  /** What the trigger is waiting for — "Quest complete" or "Objective done:
   *  <description>". Shown on every row regardless of kind; for an `event`
   *  row it doubles as the "how close" answer, since there is no countdown
   *  worth printing. */
  waitingFor: string;
  kind: "time" | "event";
  /** Whole in-world days from campaign-today to the fire date. Zero or
   *  negative means already due. Meaningful for both kinds (an `event` row
   *  is always <= 0 by construction) but the horizon only ever excludes
   *  `time` rows — see the module doc comment. */
  daysUntil: number;
}

/**
 * Two in-world weeks: enough to cover the next session or two of prep without
 * turning "about to fire" into "everything scheduled, ever" — a trigger set
 * three story arcs out belongs on the quest's own Consequences list, not on
 * a glance-at-the-table dashboard card.
 */
export const TRIGGER_HORIZON_DAYS = 14;

/**
 * Mirrors `harptosAbsDays` in `src/composables/useQuests.ts` (L44-47)
 * exactly: a fixed 12-month, 30-day-per-month count, intercalary days
 * ignored. That is not a simplification made here — it is the literal
 * arithmetic `fireDueTriggers` (useQuests.ts:672-676) evaluates a scheduled
 * row's fire date against to decide whether it is due, so this widget has to
 * use the same formula or its "about to fire" verdict would silently
 * disagree with when the trigger actually fires. `lib/calendar/upcoming.ts`'s
 * day math is adapter-aware (leap years, intercalary festivals) and is the
 * *more correct* general calendar tool, but reusing it here would compute a
 * different day count than the system that actually fires the trigger —
 * agreeing with `fireDueTriggers` matters more than being more accurate than
 * it is. `formatDaysUntil` from that module is reused below for display,
 * since formatting a day count into words does not carry this same risk.
 */
function harptosAbsDays(year: number, month: number, day: number): number {
  return year * 12 * 30 + (month - 1) * 30 + day;
}

/**
 * Every unfired scheduled trigger that is due now or within the horizon,
 * earliest first (ties broken by quest title so equal-day rows have a stable
 * order). `event` rows are exempt from the horizon check — see the module
 * doc comment — and always sort at or before any `time` row for the same
 * day, since `daysUntil` for an `event` row is never positive.
 */
export function deriveQuestTriggerDueRows(
  rows: readonly ScheduledTriggerRow[],
  today: CalendarToday,
  horizonDays: number = TRIGGER_HORIZON_DAYS,
): QuestTriggerDueRow[] {
  const todayAbs = harptosAbsDays(today.year, today.month, today.day);
  const due: QuestTriggerDueRow[] = [];

  for (const row of rows) {
    if (row.fired_at !== null) continue;
    const trigger = row.trigger;
    if (!trigger) continue;
    const quest = row.quest;
    if (!quest) continue;

    const daysUntil = harptosAbsDays(row.fire_year, row.fire_month, row.fire_day) - todayAbs;
    const kind: QuestTriggerDueRow["kind"] = trigger.offset_days === 0 ? "event" : "time";
    if (kind === "time" && daysUntil > horizonDays) continue;

    const waitingFor = trigger.trigger_type === "quest_complete"
      ? "Quest complete"
      : `Objective done: ${trigger.objective?.description ?? "??? (removed)"}`;

    due.push({
      scheduledId: row.id,
      questId: quest.id,
      questTitle: quest.title || "Untitled Quest",
      waitingFor,
      kind,
      daysUntil,
    });
  }

  return due.sort((a, b) => a.daysUntil - b.daysUntil || a.questTitle.localeCompare(b.questTitle));
}
