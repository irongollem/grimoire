import { describe, expect, it } from "vitest";
import { canAutoRollSpellEffect, canCastAsRitual, defaultRitualStyle } from "./spellcastingPolicy";

const base = {
  ritualStyle: "prepared",
  hasRitualTag: true,
  isReadyToCast: true,
  isInSpellbook: false,
} as const;

describe("ritual casting policy", () => {
  it("never allows a ritual cast without the Ritual tag", () => {
    expect(canCastAsRitual({ ...base, ritualStyle: "known", hasRitualTag: false })).toBe(false);
  });

  it("allows a prepared-style caster to cast a ready ritual without a slot", () => {
    expect(canCastAsRitual({ ...base })).toBe(true);
    expect(canCastAsRitual({ ...base, isReadyToCast: false })).toBe(false);
  });

  it("denies classes without a ritual style", () => {
    expect(canCastAsRitual({ ...base, ritualStyle: "none" })).toBe(false);
  });

  it("allows a known-style caster (2014 Bard) to ritual-cast any acquired spell", () => {
    expect(canCastAsRitual({ ...base, ritualStyle: "known", isReadyToCast: false })).toBe(true);
  });

  it("allows Wizard rituals from the spellbook without preparation", () => {
    expect(canCastAsRitual({ ...base, ritualStyle: "spellbook", isReadyToCast: false, isInSpellbook: true })).toBe(true);
    expect(canCastAsRitual({ ...base, ritualStyle: "spellbook_or_prepared", isReadyToCast: false, isInSpellbook: true })).toBe(true);
  });

  it("falls back to the edition default for unlisted classes", () => {
    expect(defaultRitualStyle("2014")).toBe("none");
    expect(defaultRitualStyle("2024")).toBe("prepared");
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

  it("never auto-resolves unreviewed imported mechanics", () => {
    expect(canAutoRollSpellEffect("automatic", "damage", false)).toBe(false);
    expect(canAutoRollSpellEffect(null, "healing", false)).toBe(false);
  });
});
