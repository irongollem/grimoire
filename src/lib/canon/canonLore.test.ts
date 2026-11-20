import { describe, expect, it } from "vitest";
import { normaliseDate, sortLore, worldDateLabel } from "./canonLore";

const e = (id: string, y: number | null, m: number | null = null, d: number | null = null) => ({ id, world_year: y, world_month: m, world_day: d });

describe("sortLore", () => {
  it("puts dated entries by date and the undated last, so an undated legend never sits among the years", () => {
    const sorted = sortLore([e("none", null), e("late", 412), e("early", 7)]);
    expect(sorted.map((x) => x.id)).toEqual(["early", "late", "none"]);
  });

  it("orders inside a year by month then day, with a year-only entry before its months", () => {
    const sorted = sortLore([e("c", 5, 3, 9), e("b", 5, 3, 1), e("a", 5), e("z", 4, 12, 30)]);
    expect(sorted.map((x) => x.id)).toEqual(["z", "a", "b", "c"]);
  });

  it("keeps the given order for equal dates and for undated entries, so the DM's own order is respected", () => {
    const sorted = sortLore([e("u2", null), e("a", 5), e("b", 5), e("u1", null)]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b", "u2", "u1"]);
  });
});

describe("normaliseDate", () => {
  it("clears the month and day with the year, because the table refuses a month with no year", () => {
    expect(normaliseDate({ year: null, month: 3, day: 4 })).toEqual({ year: null, month: null, day: null });
  });
  it("clears the day with the month, because the table refuses a day with no month", () => {
    expect(normaliseDate({ year: 5, month: null, day: 4 })).toEqual({ year: 5, month: null, day: null });
  });
  it("keeps a full date", () => {
    expect(normaliseDate({ year: 5, month: 3, day: 4 })).toEqual({ year: 5, month: 3, day: 4 });
  });
});

describe("worldDateLabel", () => {
  const format = (y: number, m: number | null, d: number | null) => `${y}/${m}/${d}`;
  it("says nothing for an undated entry", () => {
    expect(worldDateLabel({ year: null, month: null, day: null }, format)).toBeNull();
  });
  it("hands the calendar the date as it is, so a year alone is not given a month", () => {
    expect(worldDateLabel({ year: 412, month: null, day: null }, format)).toBe("412/null/null");
  });
});
