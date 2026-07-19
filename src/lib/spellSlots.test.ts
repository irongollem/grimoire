import { describe, expect, it } from "vitest";
import { availableSlotsForSpell, canCastWithSlot, reconcileSpellSlotUsage } from "./spellSlots";

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
});
