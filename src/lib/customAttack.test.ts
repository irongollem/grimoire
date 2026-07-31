import { describe, it, expect } from "vitest";
import { validateCustomAttack, customAttackDamageExpression } from "@/lib/customAttack";
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

  it("accepts a null damage_type", () => {
    expect(validateCustomAttack({ name: "Claw", attack_bonus: 3, damage: "1d6+1", damage_type: null })).toBeNull();
  });

  it("rejects a blank name", () => {
    expect(validateCustomAttack({ name: "", attack_bonus: 5, damage: "1d8", damage_type: null })).toMatch(/name/i);
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

  it("rejects garbage dice syntax", () => {
    expect(validateCustomAttack({ name: "Bite", attack_bonus: 5, damage: "2dd6", damage_type: null })).not.toBeNull();
  });
});

describe("customAttackDamageExpression", () => {
  const base: CustomAttack = { id: "1", name: "Bite", attack_bonus: 5, damage: "1d8+3", damage_type: "piercing" };

  it("parses a dice+modifier expression", () => {
    const parsed = customAttackDamageExpression(base);
    expect(parsed).toEqual({ terms: [{ count: 1, sides: 8 }], modifier: 3 });
  });

  it("parses a flat expression", () => {
    const parsed = customAttackDamageExpression({ ...base, damage: "4" });
    expect(parsed).toEqual({ terms: [], modifier: 4 });
  });

  it("parses a compound expression", () => {
    const parsed = customAttackDamageExpression({ ...base, damage: "2d6+1d4+2" });
    expect(parsed).toEqual({
      terms: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }],
      modifier: 2,
    });
  });

  it("returns null for an unparseable expression", () => {
    expect(customAttackDamageExpression({ ...base, damage: "garbage" })).toBeNull();
  });
});
