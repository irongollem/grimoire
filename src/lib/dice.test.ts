import { describe, it, expect } from "vitest";
import { hitPointsToMax } from "./dice";

describe("hitPointsToMax", () => {
  it("averages a pure dice expression (regression: spore servant 2d8+2)", () => {
    // Was returning 2 via parseInt("2d8+2".split(" ")[0]); should be 2*4.5 + 2 = 11.
    expect(hitPointsToMax("2d8+2", 1)).toBe(11);
  });

  it("handles a negative modifier", () => {
    expect(hitPointsToMax("3d6-2", 1)).toBe(8); // 3*3.5 - 2 = 8.5 → floor 8
  });

  it('handles the "N (dice)" monster-block format', () => {
    expect(hitPointsToMax("11 (2d8+2)", 1)).toBe(11);
  });

  it("handles a flat integer", () => {
    expect(hitPointsToMax("45", 1)).toBe(45);
  });

  it("handles compound expressions", () => {
    expect(hitPointsToMax("2d8+1d6+2", 1)).toBe(14); // 9 + 3.5 + 2 = 14.5 → floor 14
  });

  it("falls back when missing or unparseable", () => {
    expect(hitPointsToMax(null, 10)).toBe(10);
    expect(hitPointsToMax(undefined, 7)).toBe(7);
    expect(hitPointsToMax("", 5)).toBe(5);
    expect(hitPointsToMax("???", 3)).toBe(3);
  });

  it("falls back when the average would be zero or negative", () => {
    expect(hitPointsToMax("0", 4)).toBe(4);
  });
});
