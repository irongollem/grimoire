import { describe, expect, it } from "vitest";
import { canAutoRollSpellEffect, canCastAsRitual } from "./spellcastingPolicy";

const base = {
  className: "Cleric",
  hasRitualTag: true,
  isReadyToCast: true,
  isInSpellbook: false,
} as const;

describe("ritual casting policy", () => {
  it("allows a 2014 ritual caster to cast a ready ritual without a slot", () => {
    expect(canCastAsRitual({ ...base, ruleset: "2014" })).toBe(true);
  });

  it("does not grant 2014 ritual casting to classes without that feature", () => {
    expect(canCastAsRitual({ ...base, ruleset: "2014", className: "Sorcerer" })).toBe(false);
  });

  it("allows a Wizard ritual from the spellbook without preparation", () => {
    expect(canCastAsRitual({
      ...base,
      ruleset: "2014",
      className: "Wizard",
      isReadyToCast: false,
      isInSpellbook: true,
    })).toBe(true);
  });

  it("uses the 2024 prepared-spell ritual rule for other classes", () => {
    expect(canCastAsRitual({ ...base, ruleset: "2024", className: "Sorcerer" })).toBe(true);
    expect(canCastAsRitual({ ...base, ruleset: "2024", isReadyToCast: false })).toBe(false);
  });
});

describe("spell effect automation", () => {
  it("waits for attack and save outcomes before rolling damage", () => {
    expect(canAutoRollSpellEffect("ranged_spell", "damage")).toBe(false);
    expect(canAutoRollSpellEffect("melee_spell", "damage")).toBe(false);
    expect(canAutoRollSpellEffect("save", "damage")).toBe(false);
  });

  it("allows only explicitly automatic damage during casting", () => {
    expect(canAutoRollSpellEffect("automatic", "damage")).toBe(true);
    expect(canAutoRollSpellEffect(null, "damage")).toBe(false);
  });

  it("does not auto-roll healing attached to an attack or save", () => {
    expect(canAutoRollSpellEffect("automatic", "healing")).toBe(true);
    expect(canAutoRollSpellEffect("save", "healing")).toBe(false);
  });
});
