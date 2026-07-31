import { describe, it, expect, vi, afterEach } from "vitest";
import {
  roll4d6DropLowest,
  parseEquipmentList,
  POINT_BUY_COSTS,
  POINT_BUY_TOTAL,
  STANDARD_ARRAY,
} from "@/rules/characterCreation";

describe("roll4d6DropLowest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a value in the valid 3–18 range", () => {
    for (let i = 0; i < 200; i++) {
      const result = roll4d6DropLowest();
      expect(result).toBeGreaterThanOrEqual(3);
      expect(result).toBeLessThanOrEqual(18);
    }
  });

  it("drops the lowest of the four rolled dice", () => {
    // Math.random() * 6 + 1 floored: sequence of randoms drives the four dice.
    // Stub so the dice come out as [2, 5, 6, 1] (in that call order) — the sum of
    // the three kept dice (6 + 5 + 2) should be 13, with the 1 dropped.
    const dice = [2, 5, 6, 1].map((d) => (d - 1) / 6); // value that floors back to d-1, +1 => d
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => dice[call++] ?? 0);

    expect(roll4d6DropLowest()).toBe(13);
  });

  it("sums all four dice when they're all equal", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // floor(0.5*6)+1 = 4 each time
    expect(roll4d6DropLowest()).toBe(12); // three of the four 4s kept: 4+4+4
  });
});

describe("parseEquipmentList", () => {
  it("returns an empty array for blank/whitespace-only input", () => {
    expect(parseEquipmentList("")).toEqual([]);
    expect(parseEquipmentList("   ")).toEqual([]);
  });

  it("splits on commas and ' and ', trimming and dropping empties", () => {
    const prose = "a holy symbol, a prayer book, vestments, a set of common clothes, and a belt pouch containing 15 gp";
    expect(parseEquipmentList(prose)).toEqual([
      "a holy symbol",
      "a prayer book",
      "vestments",
      "a set of common clothes",
      "a belt pouch containing 15 gp",
    ]);
  });

  it("is case-insensitive when splitting on ' and '", () => {
    expect(parseEquipmentList("a rope AND a torch")).toEqual(["a rope", "a torch"]);
  });

  it("handles a single item with no separators", () => {
    expect(parseEquipmentList("a backpack")).toEqual(["a backpack"]);
  });
});

describe("point-buy cost table", () => {
  it("costs 0 at the floor score of 8", () => {
    expect(POINT_BUY_COSTS[8]).toBe(0);
  });

  it("is monotonically non-decreasing as score increases", () => {
    const scores = Object.keys(POINT_BUY_COSTS).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < scores.length; i++) {
      expect(POINT_BUY_COSTS[scores[i]]).toBeGreaterThanOrEqual(POINT_BUY_COSTS[scores[i - 1]]);
    }
  });

  it("spending the max score on every ability exceeds the total point budget", () => {
    const maxScore = Math.max(...Object.keys(POINT_BUY_COSTS).map(Number));
    const costOfAllMax = POINT_BUY_COSTS[maxScore] * 6;
    expect(costOfAllMax).toBeGreaterThan(POINT_BUY_TOTAL);
  });

  it("standard array has exactly 6 scores, matching the number of abilities", () => {
    expect(STANDARD_ARRAY).toHaveLength(6);
  });
});
