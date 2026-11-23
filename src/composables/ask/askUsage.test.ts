import { describe, expect, it } from "vitest";
import { freeAsksLeft } from "./askUsage";

const noon = new Date("2026-11-23T12:00:00Z");

describe("freeAsksLeft", () => {
  // Bug caught: yesterday's used count carried into today, so a DM who spent five yesterday sees none left.
  it("gives the full five back when the row is from an earlier day", () => {
    expect(freeAsksLeft({ day: "2026-11-22", free_used: 5 }, noon)).toBe(5);
    expect(freeAsksLeft(null, noon)).toBe(5);
  });

  // Bug caught: today's row not subtracted, or going below zero.
  it("subtracts today's use and never goes negative", () => {
    expect(freeAsksLeft({ day: "2026-11-23", free_used: 2 }, noon)).toBe(3);
    expect(freeAsksLeft({ day: "2026-11-23", free_used: 9 }, noon)).toBe(0);
  });

  // Bug caught: the day read in local time, so a DM east of UTC sees the row as "yesterday" after midnight local.
  it("reads the day in UTC", () => {
    expect(freeAsksLeft({ day: "2026-11-23", free_used: 1 }, new Date("2026-11-23T23:30:00Z"))).toBe(4);
  });
});
