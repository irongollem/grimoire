import { describe, expect, it } from "vitest";
import { levelUpSpellChoiceCount } from "@/lib/spellPreparationPolicy";

describe("levelUpSpellChoiceCount", () => {
  it.each(["2014", "2024"] as const)("requires the %s Wizard spellbook grants", (ruleset) => {
    expect(levelUpSpellChoiceCount("Wizard", ruleset, 1, null)).toBe(6);
    expect(levelUpSpellChoiceCount("Wizard", ruleset, 2, null)).toBe(2);
    expect(levelUpSpellChoiceCount("Wizard", ruleset, 20, null)).toBe(2);
  });

  it("uses legacy known-spell progression for 2014 classes", () => {
    expect(levelUpSpellChoiceCount("Bard", "2014", 2, [4, 5, 6], "system", "known")).toBe(1);
  });

  it("uses revised prepared progression for 2024 classes", () => {
    expect(levelUpSpellChoiceCount("Sorcerer", "2024", 2, [2, 3])).toBe(2);
    expect(levelUpSpellChoiceCount("Warlock", "2024", 10, null)).toBe(0);
  });

  it("requires no learned choices for a legacy prepared caster", () => {
    expect(levelUpSpellChoiceCount("Cleric", "2014", 3, null, "system", "prepared")).toBe(0);
  });

  it("falls back to the class's own progression for a system class absent from the 2024 policy table", () => {
    // "Artificer" has no SPELL_PREPARATION_2024 entry, so the system branch
    // must fall back to legacySpellsKnown (gated on caster_type = 'known'),
    // exactly like required_level_up_spell_choices' system_classes fallback.
    expect(levelUpSpellChoiceCount("Artificer", "2024", 2, [2, 3], "system", "known")).toBe(1);
    expect(levelUpSpellChoiceCount("Artificer", "2024", 2, [2, 3], "system", "prepared")).toBe(0);
  });

  // Regression: a custom class definition must never inherit the official
  // 2024 policy tables just because it shares an official class's name.
  // required_level_up_spell_choices (migration 20260720000026) only consults
  // class_spellcasting_policies for a "system" definition — a "custom"
  // definition always derives its count from its own spells_known
  // progression, gated on caster_type = 'known'. Before this fix,
  // levelUpSpellChoiceCount applied the official Cleric prepared-caster
  // table to any class named "Cleric" regardless of kind, so a custom
  // Cleric variant would compute a different count than the server and the
  // level-up would always be rejected.
  describe("custom class definitions sharing an official class name", () => {
    it("ignores the official 2024 policy table and uses its own known-spell progression", () => {
      // Official 2024 Cleric is a prepared caster (policy.prepared is non-null,
      // casterType "prepared") — if the bug were present this would resolve
      // through SPELL_PREPARATION_2024.Cleric instead of the custom table.
      const customClericSpellsKnown = [3, 4, 5];
      expect(
        levelUpSpellChoiceCount("Cleric", "2024", 2, customClericSpellsKnown, "custom", "known"),
      ).toBe(1);
    });

    it("requires no choices when the custom definition is not a known caster", () => {
      expect(
        levelUpSpellChoiceCount("Cleric", "2024", 2, [3, 4, 5], "custom", "prepared"),
      ).toBe(0);
    });

    it("never applies the Wizard spellbook special-case to a custom Wizard", () => {
      const customWizardSpellsKnown = [2, 3, 4];
      expect(
        levelUpSpellChoiceCount("Wizard", "2024", 1, customWizardSpellsKnown, "custom", "known"),
      ).toBe(2); // not the official 6
    });
  });
});
