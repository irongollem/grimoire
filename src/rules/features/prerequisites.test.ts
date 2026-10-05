import { describe, expect, it } from "vitest";
import { applyAbilityIncrease, featPrerequisitesMet } from "./prerequisites";
import type { FeatAbilityIncrease } from "./mechanics.types";

const base = {
  level: 4,
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  canCastSpells: false,
  armorProficiencies: new Set<"light" | "medium" | "heavy" | "shield">(),
  hasFightingStyleFeature: false,
};

describe("featPrerequisitesMet", () => {
  it("no prerequisites is always met", () => {
    expect(featPrerequisitesMet(null, base)).toEqual({ met: true, unmet: [] });
  });
  it("Strength or Dexterity 13", () => {
    const pre = { abilities: { any_of: { str: 13, dex: 13 } } };
    expect(featPrerequisitesMet(pre, base)).toEqual({ met: false, unmet: ["Strength or Dexterity 13"] });
    expect(featPrerequisitesMet(pre, { ...base, abilityScores: { ...base.abilityScores, dex: 13 } }).met).toBe(true);
  });
  it("2014 Grappler: Strength 13", () => {
    const pre = { abilities: { any_of: { str: 13 } } };
    expect(featPrerequisitesMet(pre, base).unmet).toEqual(["Strength 13"]);
  });
  it("level", () => {
    expect(featPrerequisitesMet({ level: 4 }, base).met).toBe(true);
    expect(featPrerequisitesMet({ level: 8 }, base).unmet).toEqual(["Level 8"]);
  });
  it("spellcasting, armor and fighting style", () => {
    const pre = { spellcasting: true, armor: "medium", fighting_style_feature: true } as const;
    expect(featPrerequisitesMet(pre, base).unmet).toEqual([
      "The ability to cast at least one spell",
      "Medium armor training",
      "The Fighting Style feature",
    ]);
    const ok = {
      ...base,
      canCastSpells: true,
      armorProficiencies: new Set(["medium"] as const),
      hasFightingStyleFeature: true,
    };
    expect(featPrerequisitesMet(pre, ok)).toEqual({ met: true, unmet: [] });
  });
});

describe("applyAbilityIncrease", () => {
  const scores = { str: 10, dex: 19, con: 10, int: 10, wis: 10, cha: 10 };
  const single: FeatAbilityIncrease = { abilities: ["str", "dex"], amount: 1, split: false, max: 20 };
  const asi: FeatAbilityIncrease = { abilities: ["str", "dex", "con", "int", "wis", "cha"], amount: 2, split: true, max: 20 };

  it("adds to the primary and returns a new object", () => {
    const out = applyAbilityIncrease(scores, single, { primary: "str" });
    expect(out.str).toBe(11);
    expect(scores.str).toBe(10);
  });
  it("throws for an ability the feat does not offer", () => {
    expect(() => applyAbilityIncrease(scores, single, { primary: "cha" })).toThrow();
  });
  it("caps at max instead of throwing", () => {
    expect(applyAbilityIncrease({ ...scores, dex: 20 }, single, { primary: "dex" }).dex).toBe(20);
    expect(applyAbilityIncrease(scores, asi, { primary: "dex" }).dex).toBe(20);
  });
  it("an Epic Boon goes to 30", () => {
    const boon: FeatAbilityIncrease = { abilities: ["str"], amount: 1, split: false, max: 30 };
    expect(applyAbilityIncrease({ ...scores, str: 29 }, boon, { primary: "str" }).str).toBe(30);
  });
  it("split: +2 to one, or +1 to each of two", () => {
    expect(applyAbilityIncrease(scores, asi, { primary: "str" }).str).toBe(12);
    const two = applyAbilityIncrease(scores, asi, { primary: "str", secondary: "con" });
    expect([two.str, two.con]).toEqual([11, 11]);
  });
  it("split rejects the same ability twice or a foreign one", () => {
    expect(() => applyAbilityIncrease(scores, asi, { primary: "str", secondary: "str" })).toThrow();
    const some: FeatAbilityIncrease = { ...asi, abilities: ["str", "dex"] };
    expect(() => applyAbilityIncrease(scores, some, { primary: "str", secondary: "cha" })).toThrow();
  });
  it("never lowers a score already above the cap", () => {
    expect(applyAbilityIncrease({ ...scores, str: 22 }, single, { primary: "str" }).str).toBe(22);
  });
});
