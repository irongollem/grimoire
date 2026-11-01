import { afterEach, describe, it, expect, vi } from "vitest";
import {
  hitPointsToMax,
  maxExpression,
  parseDiceAvg,
  parseExpression,
  parsedToCounts,
  formatCounts,
  rollDice,
  keepOne,
  scaleExpression,
} from "@/lib/dice/dice";

describe("parseExpression", () => {
  it("rejects symbolic modifiers instead of silently dropping them", () => {
    expect(parseExpression("1d8 + mod")).toBeNull();
    expect(parseExpression("2d6 + PB")).toBeNull();
  });

  it("rejects partially valid expressions", () => {
    expect(parseExpression("2d6 + ???")).toBeNull();
    expect(parseExpression("0d6 + 3")).toBeNull();
    expect(parseExpression("1d1")).toBeNull();
  });
});

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

describe("parseDiceAvg", () => {
  it("sums dice averages and flat terms, ignoring damage-type words", () => {
    // 2d6 = 7, 1d6 = 3.5, flat 5
    expect(parseDiceAvg("2d6 force + 1d6 fire + 5")).toBe(15.5);
  });

  it("is 0 for blank input", () => {
    expect(parseDiceAvg("  ")).toBe(0);
  });
});

describe("parseExpression and the sign of a modifier", () => {
  it("subtracts a negative modifier and adds a positive one", () => {
    expect(parseExpression("1d8-3")).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: -3 });
    expect(parseExpression("1d8+3")).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: 3 });
  });

  it("reads the parenthetical of a monster HP block and strips a damage word", () => {
    expect(parseExpression("22 (3d8+9)")).toEqual({ terms: [{ count: 3, sides: 8 }], modifier: 9 });
    expect(parseExpression("2d6 fire")).toEqual({ terms: [{ count: 2, sides: 6 }], modifier: 0 });
  });
});

describe("maxExpression", () => {
  it("is every die at its top face plus the modifier", () => {
    expect(maxExpression({ terms: [{ count: 2, sides: 8 }, { count: 1, sides: 6 }], modifier: -1 })).toBe(21);
  });
});

describe("scaleExpression", () => {
  it("adds extraLevels x perLevel dice to the matching die size", () => {
    expect(scaleExpression("8d6", 2, "1d6")).toBe("10d6");
  });

  it("adds a new term for a die size the base lacks", () => {
    expect(scaleExpression("2d6", 3, "1d4")).toBe("2d6" + "3d4");
  });

  it("scales a flat per-level bonus", () => {
    expect(scaleExpression("1d8+2", 2, "3")).toBe("1d8+8");
  });

  it("returns the base unchanged at zero extra levels or when either side is unparseable", () => {
    expect(scaleExpression("8d6", 0, "1d6")).toBe("8d6");
    expect(scaleExpression("8d6", -1, "1d6")).toBe("8d6");
    expect(scaleExpression("8d6", 2, "nonsense")).toBe("8d6");
    expect(scaleExpression("nonsense", 2, "1d6")).toBe("nonsense");
  });
});

describe("parsedToCounts", () => {
  it("merges repeated sizes and drops sizes the physical dice do not have", () => {
    expect(
      parsedToCounts([
        { count: 2, sides: 6 },
        { count: 1, sides: 6 },
        { count: 4, sides: 3 },
      ]),
    ).toEqual({ 6: 3 });
  });
});

describe("label words are stripped generically", () => {
  it("parses damage words that are not in any 5e list, so the core needs no vocabulary", () => {
    const two6 = { terms: [{ count: 2, sides: 6 }], modifier: 0 };
    expect(parseExpression("2d6 radiant")).toEqual(two6);
    expect(parseExpression("2d6 holy")).toEqual(two6);
    expect(parseExpression("1d8 necrotic + 2")).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: 2 });
    expect(parseDiceAvg("2d6 holy + 1d6 radiant")).toBe(10.5);
  });
});

describe("formatCounts", () => {
  it("labels the modifier once with its own sign, never as ++3 or +-2", () => {
    expect(formatCounts({ 20: 1 }, 5)).toBe("1d20+5");
    expect(formatCounts({ 6: 2 }, -1)).toBe("2d6-1");
    expect(formatCounts({ 8: 1 }, 0)).toBe("1d8");
    expect(formatCounts({ 8: 1, 6: 1 }, 0)).toBe("1d6+1d8");
  });
});

describe("rollDice (neutral)", () => {
  afterEach(() => vi.restoreAllMocks());

  function queue(...values: number[]) {
    const spy = vi.spyOn(Math, "random");
    for (const v of values) spy.mockReturnValueOnce(v);
  }

  it("never reports a crit or fumble: a natural 20 means nothing without a game system's rules", () => {
    queue(0.99);
    const hi = rollDice({ 20: 1 }, 0);
    expect(hi.breakdown).toEqual([{ val: 20, dropped: false }]);
    expect(hi.isCrit).toBe(false);
    queue(0);
    expect(rollDice({ 20: 1 }, 0).isFumble).toBe(false);
  });

  it("sums a plain pool in die-size order and adds the modifier", () => {
    queue(0.99, 0.5); // d6 -> 6, d8 -> 5
    const r = rollDice({ 8: 1, 6: 1 }, 2);
    expect(r.breakdown.map((d) => d.val)).toEqual([6, 5]);
    expect(r.total).toBe(13);
    expect(r.label).toBe("1d6+1d8+2");
  });
});

describe("keepOne", () => {
  it("keeps the highest face first and marks the others dropped", () => {
    expect(keepOne([1, 20, 11], "highest")).toEqual([
      { val: 20, dropped: false },
      { val: 1, dropped: true },
      { val: 11, dropped: true },
    ]);
  });

  it("keeps the lowest face when asked, not merely the last one given", () => {
    expect(keepOne([20, 1], "lowest")).toEqual([
      { val: 1, dropped: false },
      { val: 20, dropped: true },
    ]);
  });
});
