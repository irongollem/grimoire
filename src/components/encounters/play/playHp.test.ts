import { describe, it, expect } from "vitest";
import { hpPercent } from "./playHp";

describe("hpPercent", () => {
  it("a combatant with no maximum shows an empty bar, not NaN or Infinity", () => {
    expect(hpPercent({ hp: 5, max_hp: 0 })).toBe(0);
    expect(hpPercent({ hp: 0, max_hp: 0 })).toBe(0);
  });

  it("temporary or overheal hit points never draw past a full bar", () => {
    expect(hpPercent({ hp: 30, max_hp: 20 })).toBe(100);
  });

  it("a dropped (negative) hp never draws a negative bar", () => {
    expect(hpPercent({ hp: -4, max_hp: 20 })).toBe(0);
  });

  it("reports the rounded share in between", () => {
    expect(hpPercent({ hp: 1, max_hp: 3 })).toBe(33);
    expect(hpPercent({ hp: 10, max_hp: 20 })).toBe(50);
  });
});
