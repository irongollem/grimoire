import { describe, expect, it } from "vitest";
import { availableSlotsForSpell, canCastWithSlot, deriveEffectiveSpellSlots, reconcileSpellSlotUsage, spellSlotsFromProgression } from "./spellSlots";

describe("spell slot eligibility", () => {
  it("allows a higher-level slot when base-level slots are exhausted", () => {
    const slots = [
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 2, used: 1 },
    ];
    expect(availableSlotsForSpell(1, slots)).toEqual([
      { level: 2, max: 2, used: 1 },
    ]);
    expect(canCastWithSlot(1, slots)).toBe(true);
  });

  it("uses the actual Pact Slot level rather than inventing a base-level slot", () => {
    const pactSlots = [{ level: 3, max: 2, used: 0 }];
    expect(availableSlotsForSpell(1, pactSlots)[0]?.level).toBe(3);
  });

  it("does not treat missing slot tracking as permission for a leveled cast", () => {
    expect(canCastWithSlot(1, [])).toBe(false);
    expect(canCastWithSlot(0, [])).toBe(true);
  });

  it("rejects slots below the spell level and exhausted higher slots", () => {
    const slots = [
      { level: 1, max: 4, used: 0 },
      { level: 3, max: 2, used: 2 },
    ];
    expect(canCastWithSlot(2, slots)).toBe(false);
  });
});

describe("spell slot reconciliation", () => {
  it("derives a pinned custom short-rest progression without using its class name", () => {
    expect(spellSlotsFromProgression([[1], [2]], 2, "short")).toEqual([
      { level: 1, max: 2, used: 0, pool: "pact", recovery: "short" },
    ]);
  });

  it("keeps usage while applying recalculated ruleset maxima", () => {
    expect(reconcileSpellSlotUsage(
      [{ level: 1, max: 4, used: 0 }, { level: 2, max: 2, used: 0 }],
      [{ level: 1, max: 3, used: 2 }],
    )).toEqual([
      { level: 1, max: 4, used: 2 },
      { level: 2, max: 2, used: 0 },
    ]);
  });

  it("clamps usage when a recalculation lowers a slot maximum", () => {
    expect(reconcileSpellSlotUsage(
      [{ level: 1, max: 2, used: 0 }],
      [{ level: 1, max: 4, used: 3 }],
    )).toEqual([{ level: 1, max: 2, used: 2 }]);
  });

  it("retains created slots while reconciling multiclass maxima", () => {
    expect(reconcileSpellSlotUsage(
      [{ level: 1, max: 3, used: 0, pool: "spellcasting" as const }],
      [
        { level: 1, max: 2, used: 1, pool: "spellcasting" as const },
        { level: 2, max: 1, used: 0, pool: "temporary" as const, recovery: "none" as const },
      ],
    )).toEqual([
      { level: 1, max: 3, used: 1, pool: "spellcasting" },
      { level: 2, max: 1, used: 0, pool: "temporary", recovery: "none" },
    ]);
  });
});

describe("deriveEffectiveSpellSlots", () => {
  it("derives fresh legacy-default maxima when no slots are persisted", () => {
    expect(deriveEffectiveSpellSlots(
      { class: "Wizard", level: 1, spell_slots: null },
      [],
      "2014",
      () => undefined,
    )).toEqual([{ level: 1, max: 2, used: 0, pool: "spellcasting", recovery: "long" }]);
  });

  it("reconciles persisted slots against recalculated legacy-default maxima (e.g. after a level or ruleset change)", () => {
    expect(deriveEffectiveSpellSlots(
      { class: "Wizard", level: 3, spell_slots: [{ level: 1, max: 2, used: 1, pool: "spellcasting" }] },
      [],
      "2014",
      () => undefined,
    )).toEqual([
      { level: 1, max: 4, used: 1, pool: "spellcasting", recovery: "long" },
      { level: 2, max: 2, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
  });

  it("reconciles persisted slots against recalculated multiclass maxima", () => {
    const classEntries = [
      { class_name: "Wizard", levels: 2, class_definition_kind: "system" as const },
      { class_name: "Cleric", levels: 1, class_definition_kind: "system" as const },
    ];
    expect(deriveEffectiveSpellSlots(
      { class: "Wizard", level: 3, spell_slots: [{ level: 1, max: 3, used: 2, pool: "spellcasting" }] },
      classEntries,
      "2014",
      () => undefined,
    )).toEqual([
      { level: 1, max: 4, used: 2, pool: "spellcasting", recovery: "long" },
      { level: 2, max: 2, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
  });

  it("reconciles persisted slots against a single custom class's derived progression", () => {
    const classEntries = [
      { class_name: "Custom Caster", levels: 2, class_definition_kind: "custom" as const },
    ];
    expect(deriveEffectiveSpellSlots(
      { class: "Custom Caster", level: 2, spell_slots: [{ level: 1, max: 2, used: 1, pool: "spellcasting" }] },
      classEntries,
      "2014",
      () => ({ spell_slots: [[2], [3]], slot_recovery: "long" }),
    )).toEqual([{ level: 1, max: 3, used: 1, pool: "spellcasting", recovery: "long" }]);
  });
});

