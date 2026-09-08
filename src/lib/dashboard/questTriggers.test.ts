import type { CalendarAdapter } from "@/types/calendar.types";
import { describe, it, expect } from "vitest";
import type { CalendarToday } from "@/lib/calendar/upcoming";
import { deriveDueConsequenceRows, CONSEQUENCE_HORIZON_DAYS, type ConsequenceEventRow } from "./questTriggers";

const TODAY: CalendarToday = { year: 1495, month: 3, day: 10 };

/** Just the fields the join reads — see `downtimeQueue.test.ts` for why a
 *  full row is not spelled out on every case. */
function pending(overrides: Partial<ConsequenceEventRow> & { id: string }): ConsequenceEventRow {
  return {
    after_days: 0,
    fires_on_year: TODAY.year,
    fires_on_month: TODAY.month,
    fires_on_day: TODAY.day,
    action: "create_calendar_event",
    action_payload: { title: "The bridge collapses", event_type: "deadline", description: "No more crossing." },
    quest: { id: "quest-1", title: "The Sunken Keep" },
    ...overrides,
  };
}

/**
 * Harptos in miniature — twelve 30-day months plus a festival after month 6,
 * so a span that crosses it is one day longer than naive 12x30 arithmetic
 * would say (#766).
 */
const TEST_ADAPTER: CalendarAdapter = {
  id: "test",
  name: "Test",
  epochName: "TE",
  defaultYear: 1490,
  months: Array.from({ length: 12 }, (_unused, i) => ({
    num: i + 1,
    name: `Month ${i + 1}`,
    days: 30,
  })),
  intercalaryDays: [{ name: "Midsummer", afterMonth: 6, description: "" }],
  weekSize: 10,
  isLeapYear: () => false,
  formatDate: () => "",
};

describe("deriveDueConsequenceRows", () => {
  it("returns nothing for no pending events", () => {
    expect(deriveDueConsequenceRows(TEST_ADAPTER, [], TODAY)).toEqual([]);
  });

  it("excludes an event whose fire date is beyond the horizon", () => {
    const rows = [pending({ id: "e1", after_days: CONSEQUENCE_HORIZON_DAYS + 1 })];
    expect(deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY)).toEqual([]);
  });

  it("includes an event inside the horizon, with the right countdown", () => {
    const rows = [pending({ id: "e1", after_days: 5 })];
    const result = deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY);
    expect(result).toEqual([
      {
        eventId: "e1",
        questId: "quest-1",
        questTitle: "The Sunken Keep",
        waitingFor: 'Calendar event: "The bridge collapses"',
        daysUntil: 5,
      },
    ]);
  });

  it("describes a broadcast by its message", () => {
    const rows = [pending({
      id: "e1",
      after_days: 2,
      action: "send_broadcast",
      action_payload: { message: "The bells of the city toll in mourning." },
    })];
    const result = deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY);
    expect(result[0]!.waitingFor).toBe("Broadcast: \"The bells of the city toll in mourning.\"");
  });

  it("always includes an already-overdue event, ignoring the horizon", () => {
    const rows = [pending({ id: "e1", fires_on_day: TODAY.day - 40, after_days: 0 })];
    const result = deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.daysUntil).toBeLessThan(0);
  });

  it("drops an event whose quest is gone, rather than rendering it nameless", () => {
    const rows = [pending({ id: "e1", quest: null })];
    expect(deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY)).toEqual([]);
  });

  it("falls back to a title marker for a quest with an empty title", () => {
    const rows = [pending({ id: "e1", quest: { id: "quest-1", title: "" } })];
    const result = deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY);
    expect(result[0]!.questTitle).toBe("Untitled Quest");
  });

  it("sorts soonest-first, ties broken by quest title", () => {
    const rows = [
      pending({ id: "later", quest: { id: "q1", title: "Zebra Quest" }, after_days: 10 }),
      pending({ id: "tie-b", quest: { id: "q2", title: "Bravo Quest" }, after_days: 3 }),
      pending({ id: "tie-a", quest: { id: "q3", title: "Alpha Quest" }, after_days: 3 }),
    ];
    const result = deriveDueConsequenceRows(TEST_ADAPTER, rows, TODAY);
    expect(result.map((r) => r.eventId)).toEqual(["tie-a", "tie-b", "later"]);
  });
});
