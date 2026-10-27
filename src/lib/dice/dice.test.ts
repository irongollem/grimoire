import { afterEach, describe, it, expect, vi } from "vitest";
import {
  combineModes,
  hitPointsToMax,
  maxExpression,
  parseDamageExpression,
  parseDiceAvg,
  parseExpression,
  parsedToCounts,
  rollDice,
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

describe("combineModes", () => {
  it("returns the other mode when one side is normal", () => {
    expect(combineModes("normal", "normal")).toBe("normal");
    expect(combineModes("advantage", "normal")).toBe("advantage");
    expect(combineModes("normal", "advantage")).toBe("advantage");
    expect(combineModes("disadvantage", "normal")).toBe("disadvantage");
    expect(combineModes("normal", "disadvantage")).toBe("disadvantage");
  });

  it("keeps the mode when both sides agree", () => {
    expect(combineModes("advantage", "advantage")).toBe("advantage");
    expect(combineModes("disadvantage", "disadvantage")).toBe("disadvantage");
  });

  it("cancels to normal when advantage meets disadvantage (5e RAW)", () => {
    expect(combineModes("advantage", "disadvantage")).toBe("normal");
    expect(combineModes("disadvantage", "advantage")).toBe("normal");
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

describe("parseDamageExpression", () => {
  it("splits a compound expression into typed rolls and untyped flat numbers", () => {
    expect(parseDamageExpression("2d6 fire + 1d6 slashing + 5")).toEqual([
      { dice: "2d6", type: "fire" },
      { dice: "1d6", type: "slashing" },
      { dice: "5", type: "" },
    ]);
  });

  it("is empty for blank input", () => {
    expect(parseDamageExpression("   ")).toEqual([]);
  });
});

describe("rollDice", () => {
  afterEach(() => vi.restoreAllMocks());

  // rollDie(sides) = floor(random * sides) + 1, so 0 rolls a 1 and 0.99 rolls the top face.
  function queue(...values: number[]) {
    const spy = vi.spyOn(Math, "random");
    for (const v of values) spy.mockReturnValueOnce(v);
  }

  it("advantage keeps the higher d20 and marks the other dropped (5e PHB 'Advantage and Disadvantage')", () => {
    queue(0, 0.99);
    const r = rollDice({ 20: 1 }, 3, "advantage");
    expect(r.breakdown).toEqual([
      { val: 20, dropped: false },
      { val: 1, dropped: true },
    ]);
    expect(r.total).toBe(23);
    expect(r.isCrit).toBe(true);
    expect(r.isFumble).toBe(false);
    expect(r.label.endsWith(" (Adv)")).toBe(true);
  });

  it("disadvantage keeps the lower d20", () => {
    queue(0.99, 0);
    const r = rollDice({ 20: 1 }, -2, "disadvantage");
    expect(r.total).toBe(-1);
    expect(r.isFumble).toBe(true);
    expect(r.isCrit).toBe(false);
    expect(r.label.endsWith(" (Dis)")).toBe(true);
  });

  it("sums a plain pool and adds the modifier", () => {
    queue(0.99, 0.5); // smallest die rolls first: d6 -> 6, d8 -> 5
    const r = rollDice({ 6: 1, 8: 1 }, 2, "normal");
    expect(r.total).toBe(13);
    expect(r.isCrit).toBe(false);
  });

  it("labels the modifier once with its own sign, never as ++3 or +-2", () => {
    queue(0.5, 0.5);
    expect(rollDice({ 20: 1 }, 3, "advantage").label).toBe("1d20+3 (Adv)");
    queue(0.5, 0.5);
    expect(rollDice({ 20: 1 }, -2, "disadvantage").label).toBe("1d20-2 (Dis)");
    queue(0.5, 0.5);
    expect(rollDice({ 6: 1, 8: 1 }, 0, "normal").label).toBe("1d6+1d8");
  });

  it("a natural 20 on a lone d20 in normal mode is a crit", () => {
    queue(0.99);
    expect(rollDice({ 20: 1 }, 0, "normal").isCrit).toBe(true);
  });
});
