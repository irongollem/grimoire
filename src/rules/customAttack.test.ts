import { describe, it, expect } from "vitest";
import { validateCustomAttack, customAttackDamageExpression } from "@/rules/customAttack";
import type { CustomAttack } from "@/types/party.types";

describe("validateCustomAttack", () => {
  it("accepts a valid attack with a to-hit bonus", () => {
    expect(validateCustomAttack({ name: "Bite", attack_bonus: 5, damage: "1d8+3", damage_type: "piercing" })).toBeNull();
  });

  it("accepts a valid auto-hit attack (attack_bonus null)", () => {
    expect(validateCustomAttack({ name: "Poison Spray", attack_bonus: null, damage: "2d6", damage_type: "poison" })).toBeNull();
  });

  it("accepts a flat damage expression", () => {
    expect(validateCustomAttack({ name: "Slam", attack_bonus: 4, damage: "4", damage_type: null })).toBeNull();
  });

  it("rejects a whitespace-only name", () => {
    expect(validateCustomAttack({ name: "   ", attack_bonus: 5, damage: "1d8", damage_type: null })).toMatch(/name/i);
  });

  it("rejects a blank damage expression", () => {
    expect(validateCustomAttack({ name: "Bite", attack_bonus: 5, damage: "", damage_type: null })).toMatch(/damage/i);
  });

  it("rejects an unparseable damage expression", () => {
    expect(validateCustomAttack({ name: "Bite", attack_bonus: 5, damage: "not dice", damage_type: null })).not.toBeNull();
  });
});

describe("customAttackDamageExpression", () => {
  const base: CustomAttack = { id: "1", name: "Bite", attack_bonus: 5, damage: "1d8+3", damage_type: "piercing" };

  it("reads the attack's damage field", () => {
    const parsed = customAttackDamageExpression(base);
    expect(parsed).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: 3 });
  });

  it("returns null for an unparseable expression", () => {
    expect(customAttackDamageExpression({ ...base, damage: "garbage" })).toBeNull();
  });
});
