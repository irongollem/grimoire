import { describe, expect, it } from "vitest";
import { xpRewardOf } from "./xpReward";

describe("xpRewardOf", () => {
  it.each([
    ["1800", 1800],
    [" 450 ", 450],
    ["1", 1],
    ["10000000", 10_000_000],
  ])("saves %j as %i", (typed, saved) => {
    expect(xpRewardOf(typed)).toBe(saved);
  });

  // Each of these would be refused by the column's check (or is no amount), and the autosave would fail on it.
  it.each(["", "   ", "0", "-50", "12.5", "lots", "10000001"])("saves %j as no XP", (typed) => {
    expect(xpRewardOf(typed)).toBeNull();
  });
});
