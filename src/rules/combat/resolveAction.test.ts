import { describe, expect, it } from "vitest";
import type { AttackStructure, SaveStructure } from "@/types/statBlock.types";
import { halveDamage, halveParts, resolveAttackAction, resolveSaveAction } from "./resolveAction.ts";

const attack: AttackStructure = {
  delivery: "melee",
  bonus: 5,
  hit: [{ dice: "1d8+3", type: "slashing" }, { dice: "2d6", type: "poison" }],
};
const save: SaveStructure = { ability: "dex", dc: 14, fail: [{ dice: "8d6", type: "fire" }], success: "half", conditions: ["Prone"] };

describe("halveDamage", () => {
  it.each([[7, 3], [8, 4], [0, 0], [1, 0]])("%i -> %i", (a, e) => expect(halveDamage(a)).toBe(e));
});

describe("resolveAttackAction", () => {
  const input = { attack, targetAc: 15, targetConditions: [], withinFiveFeet: true };
  it("miss returns no damage", () => {
    const r = resolveAttackAction({ ...input, d20: 5 });
    expect(r.roll.hit).toBe(false);
    expect(r.damageToRoll).toBeNull();
  });
  it("hit returns each part", () => {
    const r = resolveAttackAction({ ...input, d20: 12 });
    expect(r.damageToRoll).toHaveLength(2);
    expect(r.damageToRoll?.[0].parsed.terms[0].count).toBe(1);
  });
  it("nat 20 doubles dice", () => {
    const r = resolveAttackAction({ ...input, d20: 20 });
    expect(r.damageToRoll?.[1].parsed.terms[0].count).toBe(4);
    expect(r.damageToRoll?.[0].parsed.modifier).toBe(3);
  });
  it("hit on a Paralyzed adjacent target auto-crits", () => {
    const r = resolveAttackAction({ ...input, d20: 12, targetConditions: ["Paralyzed"] });
    expect(r.roll.critical).toBe(true);
    expect(r.damageToRoll?.[0].parsed.terms[0].count).toBe(2);
  });
  it("no auto-crit at range", () => {
    expect(resolveAttackAction({ ...input, d20: 12, targetConditions: ["Paralyzed"], withinFiveFeet: false }).roll.critical).toBe(false);
  });
});

describe("resolveSaveAction", () => {
  const base = { save, saveBonus: 2, targetConditions: [] as string[] };
  it("failure: full damage plus conditions", () => {
    const r = resolveSaveAction({ ...base, d20: 5 });
    expect(r).toMatchObject({ damageMultiplier: 1, conditionsImposed: ["Prone"] });
  });
  it("success with half", () => {
    expect(resolveSaveAction({ ...base, d20: 12 })).toMatchObject({ damageMultiplier: 0.5, conditionsImposed: [] });
  });
  it("success with none", () => {
    expect(resolveSaveAction({ ...base, save: { ...save, success: "none" }, d20: 12 }).damageMultiplier).toBe(0);
  });
  it("auto-fails Dex while Stunned despite a natural 20", () => {
    const r = resolveSaveAction({ ...base, d20: 20, saveBonus: 10, targetConditions: ["Stunned"] });
    expect(r.roll.success).toBe(false);
    expect(r.damageMultiplier).toBe(1);
  });
  it("Stunned does not auto-fail a Wis save", () => {
    const r = resolveSaveAction({ ...base, save: { ...save, ability: "wis" }, d20: 20, targetConditions: ["Stunned"] });
    expect(r.roll.success).toBe(true);
  });
});

describe("halveParts", () => {
  const sum = (parts: Array<{ amount: number }>) => parts.reduce((n, p) => n + p.amount, 0);
  it("7 fire + 7 poison halves to 7 in total, not 6", () => {
    const out = halveParts([{ amount: 7, type: "fire" }, { amount: 7, type: "poison" }]);
    expect(sum(out)).toBe(7);
    expect(out.map((p) => p.type)).toEqual(["fire", "poison"]);
  });
  it("a single odd part rounds down", () => expect(halveParts([{ amount: 5, type: "fire" }])).toEqual([{ amount: 2, type: "fire" }]));
  it("3+3+3 sums to 4, spare points to the earliest ties", () => {
    const out = halveParts([{ amount: 3, type: "fire" }, { amount: 3, type: "cold" }, { amount: 3, type: null }]);
    expect(out.map((p) => p.amount)).toEqual([2, 1, 1]);
  });
  it("keeps each part's type so a resisted half part is still resisted afterwards", () => {
    const out = halveParts([{ amount: 7, type: "fire" }, { amount: 7, type: "cold" }]);
    expect(out).toEqual([{ amount: 4, type: "fire" }, { amount: 3, type: "cold" }]);
    // Resistance to fire then halves the 4 once more: 2 + 3 = 5.
    expect(halveDamage(out[0].amount) + out[1].amount).toBe(5);
  });
  it("an even total loses nothing", () => expect(sum(halveParts([{ amount: 4, type: "fire" }, { amount: 6, type: "cold" }]))).toBe(5));
});
