import { describe, it, expect } from "vitest";
import {
  bandFor, budgetFor, canAttune, diceAverage, laneFor, magicDcFor, parseDice, rarityCeiling, RARITY_ORDER,
  tierOf, timeFloorFor, toMinutes,
} from "./budget.ts";

// The invention tables are DMG 7-1 (price bands) and the app's own power budget.
// Their exact numbers are data; what has to hold is that the ladder never
// goes backwards, so a rarer item is never cheaper, weaker or quicker to make.
const TIERS = RARITY_ORDER.filter((r) => r !== "artifact");

describe("rarityCeiling", () => {
  it("floors at common and caps at legendary", () => {
    expect(rarityCeiling(["mundane", "mundane"])).toBe("common");
    expect(rarityCeiling([])).toBe("common");
    expect(rarityCeiling(["mundane", "rare"])).toBe("rare");
    expect(rarityCeiling(["artifact"])).toBe("legendary");
  });
});

describe("artifact", () => {
  it("is priced, budgeted and timed as legendary", () => {
    expect(tierOf("artifact")).toBe("legendary");
    expect(bandFor("artifact")).toEqual(bandFor("legendary"));
    expect(budgetFor("artifact")).toEqual(budgetFor("legendary"));
    expect(magicDcFor("artifact")).toBe(magicDcFor("legendary"));
    expect(timeFloorFor("artifact")).toEqual(timeFloorFor("legendary"));
  });
});

describe("the rarity ladder", () => {
  it("has price bands that rise without overlapping, from common up (mundane is open ended)", () => {
    const priced = TIERS.filter((r) => r !== "mundane");
    for (let i = 1; i < priced.length; i++) {
      const lower = bandFor(priced[i - 1]);
      expect(lower.max, `${priced[i - 1]} has an upper bound`).not.toBeNull();
      expect(bandFor(priced[i]).min, `${priced[i]} starts above ${priced[i - 1]}`).toBeGreaterThan(lower.max as number);
    }
    expect(bandFor("legendary").max).toBeNull();
  });

  it("never lets a rarer tier do less", () => {
    const numeric = ["effectsMax", "bonusMax", "extraDamageAvgMax", "healingAvgMax", "chargesMax", "resistanceTypes"] as const;
    for (let i = 1; i < TIERS.length; i++) {
      for (const field of numeric) {
        expect(budgetFor(TIERS[i])[field], `${field} at ${TIERS[i]}`).toBeGreaterThanOrEqual(budgetFor(TIERS[i - 1])[field]);
      }
    }
  });

  it("makes a rarer magic item harder and slower to craft", () => {
    const magic = TIERS.filter((r) => r !== "mundane");
    for (let i = 1; i < magic.length; i++) {
      expect(magicDcFor(magic[i]) as number).toBeGreaterThan(magicDcFor(magic[i - 1]) as number);
    }
    for (let i = 1; i < TIERS.length; i++) {
      const slower = timeFloorFor(TIERS[i]);
      const faster = timeFloorFor(TIERS[i - 1]);
      expect(toMinutes(slower.value, slower.unit)).toBeGreaterThan(toMinutes(faster.value, faster.unit));
    }
  });

  it("gives a mundane item no fixed DC, since the model proposes it", () => {
    expect(magicDcFor("mundane")).toBeNull();
  });
});

describe("canAttune", () => {
  it("opens at uncommon", () => {
    expect(canAttune("common")).toBe(false);
    expect(canAttune("uncommon")).toBe(true);
    expect(canAttune("artifact")).toBe(true);
  });
});

describe("a discipline's lane", () => {
  it("lets cooking make food and not a sword", () => {
    expect(laneFor("cooking")).toContain("provision");
    expect(laneFor("cooking")).not.toContain("weapon");
  });
});

describe("dice", () => {
  it("parses NdM with an optional signed modifier, spaces ignored", () => {
    expect(parseDice("2d4+2")).toEqual({ count: 2, sides: 4, mod: 2 });
    expect(parseDice(" 1 d 6 - 1 ")).toEqual({ count: 1, sides: 6, mod: -1 });
    expect(parseDice("3D8")).toEqual({ count: 3, sides: 8, mod: 0 });
  });

  it("refuses anything that is not a roll, or rolls nothing", () => {
    expect(parseDice("lots")).toBeNull();
    expect(parseDice("0d6")).toBeNull();
    expect(parseDice("1d0")).toBeNull();
    expect(parseDice("2d6+")).toBeNull();
    expect(parseDice("1d6 fire")).toBeNull();
  });

  it("averages as the mean of each die plus the modifier", () => {
    // 2d4 averages 5, so 2d4+2 is 7; 1d6 averages 3.5, so 1d6-1 is 2.5.
    expect(diceAverage({ count: 2, sides: 4, mod: 2 })).toBe(7);
    expect(diceAverage({ count: 1, sides: 6, mod: -1 })).toBe(2.5);
  });
});
