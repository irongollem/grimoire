import { describe, expect, it } from "vitest";
import { cadenceRrule, eveningsBetween, firstEvening, isEvening, type CadenceRule } from "./cadence.ts";

// Expected dates are read off the Gregorian calendar (`cal 11 2026` etc.), not
// out of the code: 16 Nov 2026 is a Monday, 19 Nov a Thursday, 1 Dec a Tuesday.

const weekly = (over: Partial<CadenceRule> = {}): CadenceRule => ({
  repeat: "weekly",
  every_weeks: 1,
  weekday: 4, // Thursday
  week_of_month: null,
  starts_on: "2026-11-16",
  ends_on: null,
  ...over,
});

const monthly = (weekday: number, week: number, over: Partial<CadenceRule> = {}): CadenceRule => ({
  repeat: "monthly",
  every_weeks: 1,
  weekday,
  week_of_month: week,
  starts_on: "2026-11-01",
  ends_on: null,
  ...over,
});

describe("weekly cadence", () => {
  it("starts on the first matching weekday after starts_on, not on starts_on itself", () => {
    expect(firstEvening(weekly())).toBe("2026-11-19");
  });

  it("counts starts_on itself when it falls on the weekday", () => {
    expect(firstEvening(weekly({ starts_on: "2026-11-19" }))).toBe("2026-11-19");
  });

  it("every other week skips alternate Thursdays", () => {
    expect(eveningsBetween(weekly({ every_weeks: 2 }), "2026-11-16", "2026-12-31")).toEqual([
      "2026-11-19",
      "2026-12-03",
      "2026-12-17",
      "2026-12-31",
    ]);
  });

  it("keeps the fortnight phase when asked about a later window (counts from the first evening, not from `from`)", () => {
    // From 24 Nov the next fortnightly Thursday is 3 Dec, not 26 Nov.
    expect(eveningsBetween(weekly({ every_weeks: 2 }), "2026-11-24", "2026-12-10")).toEqual(["2026-12-03"]);
  });

  it("includes an evening on the `to` date and on ends_on, and nothing after ends_on", () => {
    expect(eveningsBetween(weekly(), "2026-11-16", "2026-11-26")).toEqual(["2026-11-19", "2026-11-26"]);
    expect(eveningsBetween(weekly({ ends_on: "2026-11-26" }), "2026-11-16", "2026-12-31")).toEqual([
      "2026-11-19",
      "2026-11-26",
    ]);
  });

  it("has no evenings before starts_on even when asked from earlier", () => {
    expect(eveningsBetween(weekly({ starts_on: "2026-12-01" }), "2026-11-01", "2026-12-05")).toEqual(["2026-12-03"]);
  });

  it("stops at `limit` when there is no end", () => {
    expect(eveningsBetween(weekly(), "2026-11-16", null, 2)).toEqual(["2026-11-19", "2026-11-26"]);
  });
});

describe("monthly cadence", () => {
  it("the first Sunday of the month", () => {
    expect(eveningsBetween(monthly(7, 1), "2026-11-01", "2026-12-31")).toEqual(["2026-11-01", "2026-12-06"]);
  });

  it("the last Friday of the month, including a month whose last day is a Thursday", () => {
    // Nov 30 2026 is a Monday → 27 Nov; Dec 31 is a Thursday → 25 Dec.
    expect(eveningsBetween(monthly(5, -1), "2026-11-01", "2026-12-31")).toEqual(["2026-11-27", "2026-12-25"]);
  });

  it("skips a month whose evening fell before starts_on and rolls over the year", () => {
    // The second Tuesday of Dec 2026 is the 8th, so starting on the 9th begins in January (12 Jan 2027).
    expect(eveningsBetween(monthly(2, 2, { starts_on: "2026-12-09" }), "2026-12-01", null, 1)).toEqual(["2027-01-12"]);
  });
});

describe("isEvening", () => {
  it("is true on a regular evening and false the day after", () => {
    expect(isEvening(weekly(), "2026-11-26")).toBe(true);
    expect(isEvening(weekly(), "2026-11-27")).toBe(false);
  });
});

describe("cadenceRrule", () => {
  it.each([
    [weekly(), "FREQ=WEEKLY;BYDAY=TH"],
    [weekly({ every_weeks: 2 }), "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH"],
    [monthly(7, 1), "FREQ=MONTHLY;BYDAY=1SU"],
    [monthly(5, -1), "FREQ=MONTHLY;BYDAY=-1FR"],
  ])("%# writes the rule RFC 5545 reads back as the same evenings", (rule, expected) => {
    expect(cadenceRrule(rule)).toBe(expected);
  });

  it("ends with a floating UNTIL at the end of ends_on, so the last evening is kept", () => {
    expect(cadenceRrule(weekly({ ends_on: "2026-12-31" }))).toBe("FREQ=WEEKLY;BYDAY=TH;UNTIL=20261231T235959");
  });
});
