/** The cover a square gives against its enemies. */
import { describe, expect, it } from "vitest";
import { compareExposure } from "./scene.ts";

describe("compareExposure", () => {
  const e = (...covers: ("none" | "half" | "three_quarters" | "total")[]) => covers.map((cover, i) => ({ enemyId: `e${i}`, cover }));
  it("judges by the worst-covered enemy first, not by the total", () => {
    // [none, total] has a bare flank; [half, half] has none. The second is better covered even though a sum of ranks
    // (0+3=3) beats (1+1=2).
    expect(compareExposure(e("none", "total"), e("half", "half"))).toBeGreaterThan(0);
    expect(compareExposure(e("half", "half"), e("none", "total"))).toBeLessThan(0);
  });
  it("is a tie for equal exposure in a different order", () => {
    expect(compareExposure(e("none", "half"), e("half", "none"))).toBe(0);
  });
});
