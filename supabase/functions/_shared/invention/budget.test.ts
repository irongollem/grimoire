import { describe, it, expect } from "vitest";
import { bandFor, budgetFor, canAttune, diceAverage, laneFor, magicDcFor, parseDice, rarityCeiling, timeFloorFor } from "./budget.ts";

describe("rarityCeiling", () => {
  it("floors at common and caps at legendary", () => {
    expect(rarityCeiling(["mundane", "mundane"])).toBe("common");
    expect(rarityCeiling([])).toBe("common");
    expect(rarityCeiling(["mundane", "rare"])).toBe("rare");
    expect(rarityCeiling(["artifact"])).toBe("legendary");
  });
});

describe("tables", () => {
  it("has bands, budgets, dc, time floors and lanes", () => {
    expect(bandFor("common")).toEqual({ min: 5000, max: 10000 });
    expect(bandFor("artifact")).toEqual(bandFor("legendary"));
    expect(budgetFor("uncommon").bonusMax).toBe(1);
    expect(canAttune("common")).toBe(false);
    expect(canAttune("uncommon")).toBe(true);
    expect(magicDcFor("rare")).toBe(21);
    expect(magicDcFor("mundane")).toBeNull();
    expect(timeFloorFor("rare")).toEqual({ value: 50, unit: "days" });
    expect(laneFor("cooking")).toEqual(["provision"]);
  });
});

describe("dice", () => {
  it("parses and averages", () => {
    expect(parseDice("2d4+2")).toEqual({ count: 2, sides: 4, mod: 2 });
    expect(diceAverage(parseDice("2d4+2")!)).toBe(7);
    expect(diceAverage(parseDice("1d6-1")!)).toBe(2.5);
    expect(parseDice("lots")).toBeNull();
    expect(parseDice("0d6")).toBeNull();
  });
});
