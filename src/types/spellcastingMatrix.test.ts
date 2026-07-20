import { describe, expect, it } from "vitest";
import {
  getCasterCategory,
  getCastingAbility,
  getDefaultSpellSlots,
  getMulticlassSpellSlots,
  SPELL_CLASSES,
} from "./spell.types";
import { SPELL_PREPARATION_2024, policyValueAtLevel } from "@/lib/spellPreparationPolicy";

const STANDARD_2024 = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"] as const;

describe.each(["2014", "2024"] as const)("%s caster progression matrix", (ruleset) => {
  it.each(SPELL_CLASSES)("has a valid, isolated slot progression for %s", (className) => {
    for (let level = 1; level <= 20; level++) {
      const slots = getDefaultSpellSlots(className, level, ruleset);
      expect(slots.every((slot) => slot.level >= 1 && slot.level <= 9 && slot.max > 0 && slot.used === 0)).toBe(true);
      expect(new Set(slots.map((slot) => `${slot.pool}:${slot.level}`)).size).toBe(slots.length);
      expect(slots.every((slot) => className === "Warlock"
        ? slot.pool === "pact" && slot.recovery === "short"
        : slot.pool === "spellcasting" && slot.recovery === "long")).toBe(true);
    }
  });

  it("keeps Pact Magic separate in every multiclass combination", () => {
    const slots = getMulticlassSpellSlots([
      { class_name: "Warlock", levels: 5 },
      { class_name: "Sorcerer", levels: 5 },
    ], ruleset);
    expect(slots.some((slot) => slot.pool === "pact" && slot.level === 3)).toBe(true);
    expect(slots.some((slot) => slot.pool === "spellcasting" && slot.level === 3)).toBe(true);
  });
});

describe("2024 preparation matrix", () => {
  it.each(STANDARD_2024)("defines all 20 levels independently for %s", (className) => {
    const policy = SPELL_PREPARATION_2024[className];
    expect(policy.prepared).toHaveLength(20);
    if (policy.cantrips) expect(policy.cantrips).toHaveLength(20);
    for (let level = 1; level <= 20; level++) {
      expect(policyValueAtLevel(policy.prepared, level)).toBeGreaterThan(0);
    }
  });

  it("defines casting abilities and categories for every supported caster", () => {
    for (const className of SPELL_CLASSES) {
      expect(getCasterCategory(className)).not.toBe("none");
      expect(getCastingAbility(className)).not.toBeNull();
    }
  });
});

