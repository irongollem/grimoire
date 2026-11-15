import { describe, expect, it } from "vitest";
import { moveBarShares } from "./playSpeed";

describe("the movement bar", () => {
  // #1125 frame 10: "Gilt: moved, then speed, dashed: a Dash" - the bar is two speeds long.
  it("20 ft of a 30 ft speed fills a third of the speed half, so a third of the bar", () => {
    expect(moveBarShares(20, 30).moved).toBeCloseTo(1 / 3);
    expect(moveBarShares(20, 30).dashFrom).toBe(0.5);
  });
  it("a Dash fills into the second half and stops at the end", () => {
    expect(moveBarShares(45, 30).moved).toBeCloseTo(0.75);
    expect(moveBarShares(200, 30).moved).toBe(1);
  });
  it("a creature that cannot move shows the bar full once it has moved at all", () => {
    expect(moveBarShares(0, 0).moved).toBe(0);
    expect(moveBarShares(5, 0).moved).toBe(1);
  });
});
