import { describe, it, expect } from "vitest";
import type { CalendarAdapter } from "@/types/calendar.types";
import { addDays, daysFromTo, isOnOrBefore, buildYearIndex } from "./dayMath";

/**
 * Three 30-day months with two intercalary days after month 1 and a leap-only
 * one after month 2. Non-leap year: 92 days. Leap year: 93. Small enough to
 * count by hand, which is the point — every assertion below is checkable.
 */
const TEST: CalendarAdapter = {
  id: "test",
  name: "Test",
  epochName: "TE",
  defaultYear: 1000,
  months: [
    { num: 1, name: "First", days: 30 },
    { num: 2, name: "Second", days: 30 },
    { num: 3, name: "Third", days: 30 },
  ],
  intercalaryDays: [
    { name: "Founding", afterMonth: 1, description: "" },
    { name: "Midyear", afterMonth: 1, description: "" },
    { name: "Leap Day", afterMonth: 2, description: "", isLeapOnly: true },
  ],
  weekSize: 10,
  isLeapYear: (year) => year % 4 === 0,
  formatDate: () => "",
};

/** Harptos in miniature: months only, no intercalary days — the shape the old
 *  `addHarptoDays` assumed every calendar had. */
const PLAIN: CalendarAdapter = { ...TEST, intercalaryDays: [] };

describe("buildYearIndex", () => {
  it("counts intercalary days into the year's length, leap-gated", () => {
    expect(buildYearIndex(TEST, 2001).totalDays).toBe(92);
    expect(buildYearIndex(TEST, 2000).totalDays).toBe(93);
  });
});

describe("daysFromTo", () => {
  it("counts within a month", () => {
    expect(daysFromTo(TEST, { year: 2001, month: 1, day: 1 }, { year: 2001, month: 1, day: 11 })).toBe(11 - 1);
  });

  // The whole point: two festival days sit between month 1 and month 2.
  it("counts intercalary days that fall between the two dates", () => {
    const span = daysFromTo(TEST, { year: 2001, month: 1, day: 30 }, { year: 2001, month: 2, day: 1 });
    expect(span).toBe(3); // Founding, Midyear, then 2/1
  });

  it("omits a leap-only day in a non-leap year and counts it in a leap year", () => {
    const from = { month: 2, day: 30 };
    const to = { month: 3, day: 1 };
    expect(daysFromTo(TEST, { year: 2001, ...from }, { year: 2001, ...to })).toBe(1);
    expect(daysFromTo(TEST, { year: 2000, ...from }, { year: 2000, ...to })).toBe(2);
  });

  it("crosses a year boundary using each year's real length", () => {
    // 2000 is a leap year here (93 days), so the last day of 2000 to the first
    // of 2001 is one day, and a full lap of 2001 is 92.
    expect(daysFromTo(TEST, { year: 2000, month: 3, day: 30 }, { year: 2001, month: 3, day: 30 })).toBe(92);
  });

  it("is negative when the second date is earlier", () => {
    expect(daysFromTo(TEST, { year: 2001, month: 2, day: 1 }, { year: 2001, month: 1, day: 30 })).toBe(-3);
  });

  it("has no answer for a month the calendar does not have", () => {
    expect(daysFromTo(TEST, { year: 2001, month: 1, day: 1 }, { year: 2001, month: 99, day: 1 })).toBeUndefined();
  });
});

describe("isOnOrBefore", () => {
  it("is true for the same day and for an earlier one", () => {
    const day = { year: 2001, month: 2, day: 5 };
    expect(isOnOrBefore(TEST, day, day)).toBe(true);
    expect(isOnOrBefore(TEST, { year: 2001, month: 1, day: 5 }, day)).toBe(true);
    expect(isOnOrBefore(TEST, { year: 2001, month: 3, day: 5 }, day)).toBe(false);
  });

  // A trigger stamped with an unreadable date must not fire; treating it as
  // due would go off on a day nobody can point at.
  it("refuses to call an unplaceable date due", () => {
    expect(
      isOnOrBefore(TEST, { year: 2001, month: 99, day: 1 }, { year: 2001, month: 1, day: 1 }),
    ).toBe(false);
  });
});

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays(TEST, { year: 2001, month: 1, day: 1 }, 5)).toEqual({ year: 2001, month: 1, day: 6 });
  });

  // The #766 bug in one assertion: the old helper ignored intercalary days, so
  // it landed on 2/1 and the trigger fired two days early.
  it("spends intercalary days on the way, so a crossing offset lands later", () => {
    expect(addDays(TEST, { year: 2001, month: 1, day: 30 }, 3)).toEqual({ year: 2001, month: 2, day: 1 });
    // The same calendar without festivals: three days past 1/30 is 2/3.
    expect(addDays(PLAIN, { year: 2001, month: 1, day: 30 }, 3)).toEqual({ year: 2001, month: 2, day: 3 });
  });

  // `quest_trigger_scheduled` has three integer columns and nowhere to put
  // "Founding", so landing on one rolls forward to the next dated day.
  it("never returns an intercalary day, rolling forward to the next dated one", () => {
    // 1/30 + 1 is Founding, + 2 is Midyear; both roll to 2/1.
    expect(addDays(TEST, { year: 2001, month: 1, day: 30 }, 1)).toEqual({ year: 2001, month: 2, day: 1 });
    expect(addDays(TEST, { year: 2001, month: 1, day: 30 }, 2)).toEqual({ year: 2001, month: 2, day: 1 });
  });

  it("rolls into the next year, using this year's real length", () => {
    expect(addDays(TEST, { year: 2001, month: 3, day: 30 }, 1)).toEqual({ year: 2002, month: 1, day: 1 });
  });

  it("walks back for a negative offset", () => {
    expect(addDays(TEST, { year: 2002, month: 1, day: 1 }, -1)).toEqual({ year: 2001, month: 3, day: 30 });
  });

  it("returns the date unchanged when the adapter cannot place it", () => {
    const bad = { year: 2001, month: 99, day: 1 };
    expect(addDays(TEST, bad, 10)).toEqual(bad);
  });

  it("adds nothing for a zero offset", () => {
    const day = { year: 2001, month: 2, day: 14 };
    expect(addDays(TEST, day, 0)).toEqual(day);
  });

  // A full lap of a non-leap year returns the same date.
  it("returns the same date after exactly one year's worth of days", () => {
    const day = { year: 2001, month: 1, day: 1 };
    expect(addDays(TEST, day, buildYearIndex(TEST, 2001).totalDays)).toEqual({ ...day, year: 2002 });
  });
});
