import { describe, it, expect } from "vitest";
import { trackerInitialValue } from "./trackerValue";

describe("trackerInitialValue", () => {
  it("falls back to min when start is not set", () => {
    expect(trackerInitialValue({ min: 0, max: 10 })).toBe(0);
    expect(trackerInitialValue({ min: 1, max: 6 })).toBe(1);
  });

  it("uses start when set", () => {
    // The demo campaign's Lucidity: 0 to 10, every character starts at 8.
    expect(trackerInitialValue({ min: 0, max: 10, start: 8 })).toBe(8);
  });

  it("clamps a start below min up to min", () => {
    expect(trackerInitialValue({ min: 5, max: 10, start: -3 })).toBe(5);
  });

  it("clamps a start above max down to max", () => {
    expect(trackerInitialValue({ min: 0, max: 10, start: 99 })).toBe(10);
  });

  it("treats start: 0 as a real value, not absence", () => {
    expect(trackerInitialValue({ min: -5, max: 5, start: 0 })).toBe(0);
  });
});
