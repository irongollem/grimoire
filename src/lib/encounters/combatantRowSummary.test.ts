import { describe, expect, it } from "vitest";
import { conditionSummary, hpFraction, hpTone } from "./combatantRowSummary";

describe("hpTone", () => {
  // app convention: strictly above 50% is success, strictly above 25% caution
  it.each([
    [51, 100, "success"],
    [50, 100, "caution"], // exactly half is already worrying
    [26, 100, "caution"],
    [25, 100, "danger"], // exactly a quarter is critical
    [1, 100, "danger"],
    [0, 100, "danger"],
  ] as const)("%i/%i is %s", (hp, max, tone) => {
    expect(hpTone(hp, max)).toBe(tone);
  });
});

describe("hpFraction", () => {
  it("is empty for a zero max instead of NaN, which would render a full-width bar", () => {
    expect(hpFraction(5, 0)).toBe(0);
  });
  it("clamps overheal and negatives so the bar never leaves its track", () => {
    expect(hpFraction(120, 100)).toBe(1);
    expect(hpFraction(-3, 100)).toBe(0);
  });
});

describe("conditionSummary", () => {
  const c = (name: string, level?: number) => ({ name, level });
  it("lists up to two names and counts the rest", () => {
    expect(conditionSummary([c("Prone"), c("Poisoned"), c("Stunned"), c("Blinded")])).toBe("Prone · Poisoned · +2");
  });
  it("shows two conditions in full, with no '+0' tail", () => {
    expect(conditionSummary([c("Prone"), c("Poisoned")])).toBe("Prone · Poisoned");
  });
  it("is empty for none, and carries the exhaustion level", () => {
    expect(conditionSummary([])).toBe("");
    expect(conditionSummary([c("Exhaustion", 3)])).toBe("Exhaustion 3");
  });
});
