import { describe, it, expect } from "vitest";
import { SUBCLASS_SPELL_LISTS, thirdCasterPreset } from "./subclassSpellcasting";

describe("thirdCasterPreset", () => {
  it("fills twenty rows of the published third-caster slot table", () => {
    const p = thirdCasterPreset();
    expect(p.spell_slots).toHaveLength(20);
    expect(p.spell_slots[1]).toEqual([0, 0, 0, 0]);
    expect(p.spell_slots[2]).toEqual([2, 0, 0, 0]);
    expect(p.spell_slots[6]).toEqual([4, 2, 0, 0]);
    expect(p.spell_slots[19]).toEqual([4, 3, 3, 1]);
    expect(p.spells_known).toHaveLength(20);
    expect(p.cantrips_known).toHaveLength(20);
    expect(p.spells_known[2]).toBe(3);
    expect(p.cantrips_known[9]).toBe(3);
  });

  it("returns a fresh object each time", () => {
    expect(thirdCasterPreset().spells_known).not.toBe(thirdCasterPreset().spells_known);
  });
});

describe("SUBCLASS_SPELL_LISTS", () => {
  it("leaves out the parenthesised aliases", () => {
    expect(SUBCLASS_SPELL_LISTS).toContain("Wizard");
    expect(SUBCLASS_SPELL_LISTS.some(c => c.includes("("))).toBe(false);
  });
});
