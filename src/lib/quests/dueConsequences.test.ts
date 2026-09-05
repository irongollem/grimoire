import { describe, expect, it } from "vitest";
import type { CalendarAdapter } from "@/types/calendar.types";
import { dueConsequenceEvents, type PendingConsequenceEvent } from "./dueConsequences";

const TODAY = { year: 1495, month: 3, day: 10 };

function event(overrides: Partial<PendingConsequenceEvent> & { id: string }): PendingConsequenceEvent {
  return {
    after_days: 0,
    fires_on_year: TODAY.year,
    fires_on_month: TODAY.month,
    fires_on_day: TODAY.day,
    ...overrides,
  };
}

/** Harptos in miniature, same fixture shape as `dayMath.test.ts` and
 *  `questTriggers.test.ts` — a festival after month 6 so a span crossing it
 *  differs from naive 12x30 arithmetic (#766). */
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

describe("dueConsequenceEvents", () => {
  it("returns nothing for no pending events", () => {
    expect(dueConsequenceEvents(TEST_ADAPTER, [], TODAY)).toEqual([]);
  });

  it("excludes an event whose fire date is still in the future", () => {
    const rows = [event({ id: "e1", after_days: 3 })];
    expect(dueConsequenceEvents(TEST_ADAPTER, rows, TODAY)).toEqual([]);
  });

  it("includes an event whose fire date is today", () => {
    const rows = [event({ id: "e1", after_days: 0 })];
    expect(dueConsequenceEvents(TEST_ADAPTER, rows, TODAY)).toEqual(rows);
  });

  it("includes an event whose fire date has already passed", () => {
    const rows = [event({ id: "e1", fires_on_day: TODAY.day - 5, after_days: 2 })];
    expect(dueConsequenceEvents(TEST_ADAPTER, rows, TODAY)).toEqual(rows);
  });

  it("only returns the events that are actually due, preserving order", () => {
    const notYet = event({ id: "not-yet", after_days: 30 });
    const dueA = event({ id: "due-a", after_days: 0 });
    const dueB = event({ id: "due-b", fires_on_day: TODAY.day - 1, after_days: 0 });
    expect(dueConsequenceEvents(TEST_ADAPTER, [notYet, dueA, dueB], TODAY)).toEqual([dueA, dueB]);
  });
});
