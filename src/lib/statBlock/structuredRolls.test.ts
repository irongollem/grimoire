import { describe, expect, it } from "vitest";
import type { ActionStructure } from "@/types/statBlock.types";
import { combineDamageParts, structuredAttackBonus, structuredDamageParts, structuredOptionEntries, structuredSaveLabel } from "./structuredRolls";

const attack: ActionStructure = {
  kind: "attack",
  attack: {
    delivery: "melee",
    bonus: 4,
    reach: 5,
    hit: [
      { dice: "2d6+3", type: "piercing" },
      { dice: "2d6", type: "poison" },
    ],
  },
  source: "parsed",
};

describe("structuredRolls", () => {
  it("reads the attack bonus from the structure", () => {
    expect(structuredAttackBonus(attack)).toBe(4);
  });

  it("combines every hit part into one roll and names each type", () => {
    const combined = combineDamageParts(structuredDamageParts(attack));
    expect(combined?.parsed).toEqual({ terms: [{ count: 2, sides: 6 }, { count: 2, sides: 6 }], modifier: 3 });
    expect(combined?.label).toBe("2d6+3 piercing + 2d6 poison");
  });

  it("offers a save as a label and its failed-save damage as parts", () => {
    const save: ActionStructure = {
      kind: "save",
      save: { ability: "dex", dc: 14, fail: [{ dice: "6d6", type: "fire" }], success: "half", conditions: [] },
      source: "parsed",
    };
    expect(structuredSaveLabel(save)).toBe("DC 14 Dex");
    expect(structuredAttackBonus(save)).toBeNull();
    expect(structuredDamageParts(save)).toHaveLength(1);
  });

  it("offers nothing for an other entry", () => {
    const other: ActionStructure = { kind: "other", source: "parsed" };
    expect(structuredAttackBonus(other)).toBeNull();
    expect(structuredSaveLabel(other)).toBeNull();
    expect(combineDamageParts(structuredDamageParts(other))).toBeNull();
  });

  it("offers nothing for an entry flagged for review", () => {
    const review: ActionStructure = { ...attack, kind: "other", review: "bonus not in prose" };
    expect(structuredAttackBonus(review)).toBeNull();
    expect(structuredDamageParts(review)).toEqual([]);
  });

  it("offers nothing for a flagged entry even when its kind still says attack or save", () => {
    const flagged: ActionStructure = { ...attack, review: "bonus not in prose" };
    expect(structuredAttackBonus(flagged)).toBeNull();
    expect(structuredDamageParts(flagged)).toEqual([]);
    const flaggedSave: ActionStructure = {
      kind: "save",
      save: { ability: "dex", dc: 14, fail: [{ dice: "6d6", type: "fire" }], success: "half", conditions: [] },
      source: "parsed",
      review: "dc unclear",
    };
    expect(structuredSaveLabel(flaggedSave)).toBeNull();
    expect(structuredDamageParts(flaggedSave)).toEqual([]);
  });

  it("rolls the failed-save damage only for a save entry, not a rider save on something else", () => {
    const rider: ActionStructure = {
      kind: "other",
      save: { ability: "con", dc: 13, fail: [{ dice: "2d6", type: "poison" }], success: "none", conditions: [] },
      source: "parsed",
    };
    expect(structuredDamageParts(rider)).toEqual([]);
  });

  it("rolls nothing at all if any part of the damage cannot be read", () => {
    expect(combineDamageParts([{ dice: "2d6", type: "fire" }, { dice: "lots", type: null }])).toBeNull();
  });

  it("an attack with an empty hit has no damage button", () => {
    const grapple: ActionStructure = { kind: "attack", attack: { delivery: "melee", bonus: 5, hit: [] }, source: "parsed" };
    expect(structuredAttackBonus(grapple)).toBe(5);
    expect(combineDamageParts(structuredDamageParts(grapple))).toBeNull();
  });
});

describe("structuredOptionEntries", () => {
  it("turns each option into a structure the other helpers can read", () => {
    const entry: ActionStructure = {
      kind: "options",
      source: "parsed",
      options: [
        { name: "Fire Breath", kind: "save", save: { ability: "dex", dc: 15, fail: [{ dice: "12d6", type: "fire" }], success: "half", conditions: [] } },
        { name: "Bite", kind: "attack", attack: { delivery: "melee", bonus: 6, hit: [{ dice: "2d6", type: "piercing" }] } },
      ],
    };
    const [fire, bite] = structuredOptionEntries(entry);
    expect(structuredSaveLabel(fire.structure)).toBe("DC 15 Dex");
    expect(structuredDamageParts(fire.structure)).toEqual([{ dice: "12d6", type: "fire" }]);
    expect(structuredAttackBonus(bite.structure)).toBe(6);
    expect(structuredOptionEntries({ ...entry, review: "x" })).toEqual([]);
    expect(structuredOptionEntries({ ...entry, source: "manual" }).every((o) => o.structure.source === "manual")).toBe(true);
  });
});
