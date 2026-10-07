import { describe, expect, it } from "vitest";
import type { CalendarAdapter } from "@/types/calendar.types";
import { describeDeadline, formatDueDate, objectiveDueDate } from "./deadlines";

const ADAPTER: CalendarAdapter = {
  id: "test",
  name: "Test",
  epochName: "TE",
  defaultYear: 1000,
  months: [
    { num: 1, name: "Hammer", days: 30 },
    { num: 2, name: "Alturiak", alias: "Altu", days: 30 },
  ],
  intercalaryDays: [],
  weekSize: 10,
  isLeapYear: () => false,
  formatDate: () => "",
};

const today = { year: 1000, month: 1, day: 14 };

describe("objectiveDueDate", () => {
  it("is null unless all three columns are set", () => {
    expect(objectiveDueDate({ due_year: null, due_month: null, due_day: null })).toBeNull();
    expect(objectiveDueDate({ due_year: 1000, due_month: 1, due_day: null })).toBeNull();
    expect(objectiveDueDate({ due_year: 1000, due_month: 2, due_day: 5 })).toEqual({ year: 1000, month: 2, day: 5 });
  });
});

describe("formatDueDate", () => {
  it("uses the month alias when it has one", () => {
    expect(formatDueDate(ADAPTER, { year: 1000, month: 2, day: 5 })).toBe("5 Altu");
    expect(formatDueDate(ADAPTER, { year: 1000, month: 1, day: 5 })).toBe("5 Hammer");
  });
});

describe("describeDeadline", () => {
  it("is inclusive: due today is not overdue, the day after is", () => {
    expect(describeDeadline(ADAPTER, today, today)).toEqual({ label: "due today", urgency: "today" });
    expect(describeDeadline(ADAPTER, { year: 1000, month: 1, day: 13 }, today)).toEqual({ label: "overdue", urgency: "overdue" });
  });

  it("says tomorrow, then the date, flagging the near ones", () => {
    expect(describeDeadline(ADAPTER, { year: 1000, month: 1, day: 15 }, today)).toEqual({ label: "due tomorrow", urgency: "soon" });
    expect(describeDeadline(ADAPTER, { year: 1000, month: 1, day: 17 }, today)).toEqual({ label: "due 17 Hammer", urgency: "soon" });
    expect(describeDeadline(ADAPTER, { year: 1000, month: 2, day: 5 }, today)).toEqual({ label: "due 5 Altu", urgency: "later" });
  });

  it("returns null for a date the calendar cannot place", () => {
    expect(describeDeadline(ADAPTER, { year: 1000, month: 9, day: 1 }, today)).toBeNull();
  });
});
