import { describe, expect, it } from "vitest";
import { getSpellPreparationPolicy, policyValueAtLevel } from "./spellPreparationPolicy";

describe("2024 spell preparation policy", () => {
  it("uses table limits rather than 2014 ability formulas", () => {
    const sorcerer = getSpellPreparationPolicy("Sorcerer", "2024")!;
    const wizard = getSpellPreparationPolicy("Wizard", "2024")!;
    expect(policyValueAtLevel(sorcerer.prepared, 1)).toBe(2);
    expect(policyValueAtLevel(sorcerer.prepared, 10)).toBe(15);
    expect(policyValueAtLevel(wizard.prepared, 20)).toBe(25);
  });

  it("models revised replacement timing", () => {
    expect(getSpellPreparationPolicy("Bard", "2024")).toMatchObject({
      casterType: "prepared",
      changeTiming: "level_up",
      changeCount: 1,
    });
    expect(getSpellPreparationPolicy("Cleric", "2024")).toMatchObject({
      changeTiming: "long_rest",
      changeCount: null,
    });
    expect(getSpellPreparationPolicy("Paladin", "2024")).toMatchObject({
      changeTiming: "long_rest",
      changeCount: 1,
    });
  });

  it("leaves 2014 and unsupported classes on their existing policy", () => {
    expect(getSpellPreparationPolicy("Sorcerer", "2014")).toBeNull();
    expect(getSpellPreparationPolicy("Artificer", "2024")).toBeNull();
  });
});
