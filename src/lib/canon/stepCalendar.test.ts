import { describe, expect, it } from "vitest";
import { calendarPathAt, stepEventInsert, stepOnCalendar } from "./stepCalendar";

const step = { title: "The ferry stops", due_year: 512, due_month: 3 as number | null, due_day: 4 as number | null };

describe("stepOnCalendar", () => {
  // Bug caught (#1279 item 32): a step judged by a look-alike event instead of the one it became.
  it("is the step's own pointer to its event", () => {
    expect(stepOnCalendar({ calendar_event_id: "e1" })).toBe(true);
    expect(stepOnCalendar({ calendar_event_id: null })).toBe(false);
  });
});

describe("stepEventInsert and calendarPathAt", () => {
  // Bug caught: the event shown to players (a force's step is the DM's plan) or an undated event sent to the table that refuses it.
  it("is a hidden world event on the step's date, and refuses an undated step", () => {
    expect(stepEventInsert(step, "The Ferrymen")).toMatchObject({ title: "The ferry stops", event_type: "world", year: 512, month: 3, day: 4, player_visible: false });
    expect(() => stepEventInsert({ ...step, due_year: null }, "x")).toThrow();
  });
  it("opens the month, or the year when there is no month", () => {
    expect(calendarPathAt({ year: 512, month: 3 }).query).toEqual({ year: "512", month: "3" });
    expect(calendarPathAt({ year: 512, month: null }).query).toEqual({ year: "512" });
  });
});
