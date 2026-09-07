import type { CalendarEventConsequencePayload, BroadcastConsequencePayload, QuestConsequenceAction } from "@/types/quest.types";
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
 * (`QuestConsequencesPanel.vue`). The moment its condition fires, the engine
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
  action_payload: CalendarEventConsequencePayload | BroadcastConsequencePayload;
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
 * `action_payload` is jsonb, so the casts below assert a shape nothing has
 * validated — a row written by an older migration, or by hand, can be missing
 * the field the type promises. Both payload types declare their field as a
 * plain `string`, which makes a `?? ""` dead code against the *declared* type
 * while silently rendering `Calendar event: ""` for the row that is actually
 * malformed. The absence marker says so instead, the same way an unrated
 * creature reads "CR ???" rather than "CR ".
 */
const UNKNOWN_PAYLOAD_FIELD = "???";

function summarize(action: QuestConsequenceAction, payload: ConsequenceEventRow["action_payload"]): string {
  if (action === "create_calendar_event") {
    const p = payload as Partial<CalendarEventConsequencePayload>;
    return `Calendar event: "${p.title || UNKNOWN_PAYLOAD_FIELD}"`;
  }
  const p = payload as Partial<BroadcastConsequencePayload>;
  return `Broadcast: "${p.message || UNKNOWN_PAYLOAD_FIELD}"`;
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
