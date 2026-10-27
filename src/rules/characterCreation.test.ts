import { describe, it, expect, vi, afterEach } from "vitest";
import {
  roll4d6DropLowest,
  parseEquipmentList,
  saveKeysFromNames,
  POINT_BUY_COSTS,
  POINT_BUY_TOTAL,
  STANDARD_ARRAY,
} from "@/rules/characterCreation";

describe("roll4d6DropLowest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // PHB 2014 "Ability Scores": roll 4d6, drop the lowest die
  it("drops the lowest of the four rolled dice", () => {
    // Math.random() * 6 + 1 floored: sequence of randoms drives the four dice.
    // Stub so the dice come out as [2, 5, 6, 1] (in that call order) — the sum of
    // the three kept dice (6 + 5 + 2) should be 13, with the 1 dropped.
    const dice = [2, 5, 6, 1].map((d) => (d - 1) / 6); // value that floors back to d-1, +1 => d
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => dice[call++] ?? 0);

    expect(roll4d6DropLowest()).toBe(13);
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
});

// PHB 2014 "Ability Scores" (point buy): 27 points, scores 8 to 15; the standard array is
// the same budget spent: 15 + 14 + 13 + 12 + 10 + 8 costs 9 + 7 + 5 + 4 + 2 + 0 = 27.
describe("point-buy cost table", () => {
  it("prices the standard array at exactly the 27-point budget", () => {
    const cost = STANDARD_ARRAY.reduce((sum, score) => sum + POINT_BUY_COSTS[score], 0);
    expect(cost).toBe(POINT_BUY_TOTAL);
  });

  it("charges 1 point per step up to 13 and 2 points per step for 14 and 15", () => {
    for (let score = 9; score <= 13; score++) {
      expect(POINT_BUY_COSTS[score] - POINT_BUY_COSTS[score - 1]).toBe(1);
    }
    expect(POINT_BUY_COSTS[14] - POINT_BUY_COSTS[13]).toBe(2);
    expect(POINT_BUY_COSTS[15] - POINT_BUY_COSTS[14]).toBe(2);
  });
});

describe("saveKeysFromNames", () => {
  it("maps class-definition full names to ability keys", () => {
    expect(saveKeysFromNames(["Wisdom", "Charisma"])).toEqual(["wis", "cha"]);
  });
  it("is case-insensitive, accepts keys as-is, drops unknowns and duplicates", () => {
    expect(saveKeysFromNames(["STRENGTH", "con", "Luck", "strength"])).toEqual(["str", "con"]);
  });
});
