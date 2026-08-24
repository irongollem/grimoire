import { describe, it, expect } from "vitest";
import type { CalendarToday } from "@/lib/calendar/upcoming";
import { deriveQuestTriggerDueRows, TRIGGER_HORIZON_DAYS, type ScheduledTriggerRow } from "./questTriggers";

const TODAY: CalendarToday = { year: 1495, month: 3, day: 10 };

/** Just the fields the join reads — see `downtimeQueue.test.ts` for why a
 *  full row is not spelled out on every case. */
function scheduled(overrides: Partial<ScheduledTriggerRow> & { id: string }): ScheduledTriggerRow {
  return {
    fire_year: TODAY.year,
    fire_month: TODAY.month,
    fire_day: TODAY.day,
    fired_at: null,
    quest: { id: "quest-1", title: "The Sunken Keep" },
    trigger: { trigger_type: "quest_complete", offset_days: 0, objective: null },
    ...overrides,
  };
}

describe("deriveQuestTriggerDueRows", () => {
  it("returns nothing for no triggers", () => {
    expect(deriveQuestTriggerDueRows([], TODAY)).toEqual([]);
  });

  it("excludes a trigger that already fired", () => {
    const rows = [scheduled({ id: "s1", fired_at: "2026-08-01T00:00:00Z" })];
    expect(deriveQuestTriggerDueRows(rows, TODAY)).toEqual([]);
  });

  it("excludes a time trigger whose fire date is beyond the horizon", () => {
    const rows = [
      scheduled({
        id: "s1",
        fire_day: TODAY.day + TRIGGER_HORIZON_DAYS + 1,
        trigger: { trigger_type: "quest_complete", offset_days: TRIGGER_HORIZON_DAYS + 1, objective: null },
      }),
    ];
    expect(deriveQuestTriggerDueRows(rows, TODAY)).toEqual([]);
  });

  it("includes a time trigger inside the horizon, with the right countdown", () => {
    const rows = [
      scheduled({
        id: "s1",
        fire_day: TODAY.day + 5,
        trigger: { trigger_type: "quest_complete", offset_days: 5, objective: null },
      }),
    ];
    const result = deriveQuestTriggerDueRows(rows, TODAY);
    expect(result).toEqual([
      {
        scheduledId: "s1",
        questId: "quest-1",
        questTitle: "The Sunken Keep",
        waitingFor: "Quest complete",
        kind: "time",
        daysUntil: 5,
      },
    ]);
  });

  it("includes an event trigger, described by its condition rather than a countdown", () => {
    const rows = [
      scheduled({
        id: "s1",
        trigger: {
          trigger_type: "objective_done",
          offset_days: 0,
          objective: { description: "Investigate the ruins" },
        },
      }),
    ];
    const result = deriveQuestTriggerDueRows(rows, TODAY);
    expect(result).toEqual([
      {
        scheduledId: "s1",
        questId: "quest-1",
        questTitle: "The Sunken Keep",
        waitingFor: "Objective done: Investigate the ruins",
        kind: "event",
        daysUntil: 0,
      },
    ]);
  });

  it("never horizon-excludes an event trigger, unlike a time trigger", () => {
    // offset_days 0 means the fire date is the day it was scheduled, which is
    // always today-or-earlier -- so daysUntil can never exceed the horizon in
    // practice, but the exemption is asserted directly here rather than left
    // to that coincidence.
    const rows = [
      scheduled({
        id: "s1",
        fire_day: TODAY.day - 40,
        trigger: { trigger_type: "quest_complete", offset_days: 0, objective: null },
      }),
    ];
    const result = deriveQuestTriggerDueRows(rows, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("event");
  });

  it("drops a scheduled trigger whose quest is gone, rather than rendering it nameless", () => {
    const rows = [scheduled({ id: "s1", quest: null })];
    expect(deriveQuestTriggerDueRows(rows, TODAY)).toEqual([]);
  });

  it("drops a dangling scheduled row whose trigger was deleted", () => {
    const rows = [scheduled({ id: "s1", trigger: null })];
    expect(deriveQuestTriggerDueRows(rows, TODAY)).toEqual([]);
  });

  it("falls back to a marker for an objective_done trigger with no objective description", () => {
    const rows = [
      scheduled({
        id: "s1",
        trigger: { trigger_type: "objective_done", offset_days: 0, objective: null },
      }),
    ];
    const result = deriveQuestTriggerDueRows(rows, TODAY);
    expect(result[0].waitingFor).toBe("Objective done: ??? (removed)");
  });

  it("falls back to a title marker for a quest with an empty title", () => {
    const rows = [scheduled({ id: "s1", quest: { id: "quest-1", title: "" } })];
    const result = deriveQuestTriggerDueRows(rows, TODAY);
    expect(result[0].questTitle).toBe("Untitled Quest");
  });

  it("sorts soonest-first, ties broken by quest title", () => {
    const rows = [
      scheduled({
        id: "later",
        quest: { id: "q1", title: "Zebra Quest" },
        fire_day: TODAY.day + 10,
        trigger: { trigger_type: "quest_complete", offset_days: 10, objective: null },
      }),
      scheduled({
        id: "tie-b",
        quest: { id: "q2", title: "Bravo Quest" },
        fire_day: TODAY.day + 3,
        trigger: { trigger_type: "quest_complete", offset_days: 3, objective: null },
      }),
      scheduled({
        id: "tie-a",
        quest: { id: "q3", title: "Alpha Quest" },
        fire_day: TODAY.day + 3,
        trigger: { trigger_type: "quest_complete", offset_days: 3, objective: null },
      }),
    ];
    const result = deriveQuestTriggerDueRows(rows, TODAY);
    expect(result.map((r) => r.scheduledId)).toEqual(["tie-a", "tie-b", "later"]);
  });
});
