import type { QuestConsequenceAction, QuestConsequenceActionPayload } from "@/types/quest.types";
import { describeWorldConsequenceAction } from "@/lib/quests/consequences";
import type { CalendarToday } from "@/lib/calendar/upcoming";
import { addDays, daysFromTo } from "@/lib/calendar/dayMath";
import type { CalendarAdapter } from "@/types/calendar.types";

/**
 * The "about to fire" join for the "Quest consequences due" widget (#764,
 * reworked for #794).
 *
 * A `quest_consequences` row is a DM-authored rule — "when [this beat is
 * reached / this objective becomes that / the quest settles], N days later,
 * [create a calendar event / send a broadcast / move an objective]"
 * (`QuestPayoffPanel.vue` on a beat, `QuestRulesPanel.vue` on the quest). The moment its condition fires, the engine
 * logs a `quest_consequence_events` row and, for the two *world* actions,
 * performs it immediately unless `after_days > 0` — see that table's own
 * column comment. So a pending world-action event (`performed_at is null`) is
 * always a real, still-outstanding wait; nothing with zero delay ever reaches
 * this widget, because it was already performed in the same transaction that
 * logged it.
 *
 * Ledger verbs (`raise`/`reveal`/`complete`/`fail`) are deliberately excluded
 * here even though their events can also sit with `performed_at is null`
 * forever — `private.apply_quest_consequences` moves the objective the
 * instant the condition fires, regardless of `after_days`, and
 * `perform_quest_consequence` never touches a ledger verb. Showing one of
 * those rows as "about to fire" would describe something that already
 * happened as still pending.
 */

/** One `quest_consequence_events` row as the widget fetches it, restricted to
 *  the two world actions and already filtered to `performed_at is null` and
 *  `undone_at is null` at the query. */
export interface ConsequenceEventRow {
  id: string;
  after_days: number;
  fires_on_year: number;
  fires_on_month: number;
  fires_on_day: number;
  action: QuestConsequenceAction;
  // The whole payload union, not the two shapes this widget originally
  // fetched: it now asks for every world action, and a relationship shift
  // carries `{ step }` rather than a title or a message.
  action_payload: QuestConsequenceActionPayload;
  /** `null` when the quest itself is gone — the event row outlives it via
   *  `on delete cascade` on `quest_id` only in the sense that the row cascades
   *  away too, but a row fetched in the same request as its quest's delete can
   *  still race here, so the join is treated as possibly missing. */
  quest: { id: string; title: string } | null;
}

export interface DueConsequenceRow {
  eventId: string;
  questId: string;
  questTitle: string;
  /** What is about to happen — "Calendar event: "…"" or "Broadcast: "…"". */
  waitingFor: string;
  /** Whole in-world days from campaign-today to the fire date. Zero or
   *  negative means already due. */
  daysUntil: number;
}

/**
 * Two in-world weeks: enough to cover the next session or two of prep without
 * turning "about to fire" into "everything scheduled, ever" — a consequence
 * set three story arcs out belongs on the quest's own consequence list, not
 * on a glance-at-the-table dashboard card.
 */
export const CONSEQUENCE_HORIZON_DAYS = 14;

/**
 * One line for the widget, from the same describer the rule editor and the
 * backfill preview use.
 *
 * It had its own copy of the if/else chain, and inherited the same defect: a
 * `shift_npc_relationship` or `unlock_quest` row rendered as an empty
 * broadcast. Delegating means a ninth action is described once, in the place
 * the compiler already guards.
 */
function summarize(action: QuestConsequenceAction, payload: ConsequenceEventRow["action_payload"]): string {
  return describeWorldConsequenceAction(action, payload);
}

/**
 * Every pending world-action event whose `fires_on + after_days` is due now
 * or within the horizon, earliest first (ties broken by quest title so
 * equal-day rows have a stable order).
 */
export function deriveDueConsequenceRows(
  adapter: CalendarAdapter,
  rows: readonly ConsequenceEventRow[],
  today: CalendarToday,
  horizonDays: number = CONSEQUENCE_HORIZON_DAYS,
): DueConsequenceRow[] {
  const due: DueConsequenceRow[] = [];

  for (const row of rows) {
    const quest = row.quest;
    if (!quest) continue;

    const fireDate = addDays(
      adapter,
      { year: row.fires_on_year, month: row.fires_on_month, day: row.fires_on_day },
      row.after_days,
    );
    const daysUntil = daysFromTo(adapter, today, fireDate);
    // A fire date the calendar cannot place is one nobody can act on.
    if (daysUntil === undefined) continue;
    if (daysUntil > horizonDays) continue;

    due.push({
      eventId: row.id,
      questId: quest.id,
      questTitle: quest.title || "Untitled Quest",
      waitingFor: summarize(row.action, row.action_payload),
      daysUntil,
    });
  }

  return due.sort((a, b) => a.daysUntil - b.daysUntil || a.questTitle.localeCompare(b.questTitle));
}
