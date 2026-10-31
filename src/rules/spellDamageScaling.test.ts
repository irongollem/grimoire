import { describe, expect, it } from "vitest";
import { castDamageRolls, slotScaledDamageDice } from "@/rules/spellDamageScaling";

// SRD 5.1 Ice Storm: 2d8 bludgeoning and 4d6 cold; "the bludgeoning damage increases by 1d8 for each slot level above 4th".
const bludgeoning = { dice: "2d8", type: "bludgeoning" };
const cold = { dice: "4d6", type: "cold" };
const higher = { dice_per_level: "1d8", type: "bludgeoning" };

describe("slotScaledDamageDice", () => {
  // Bug: every roll grew, so Ice Storm at 6th level rolled 4d8 bludgeoning and 6d6 cold.
  it("grows only the part whose type the upcast names", () => {
    expect(slotScaledDamageDice(bludgeoning, 2, higher)).toBe("4d8");
    expect(slotScaledDamageDice(cold, 2, higher)).toBe("4d6");
  });

  it("compares the type without regard to case or padding", () => {
    expect(slotScaledDamageDice(bludgeoning, 1, { ...higher, type: " Bludgeoning " })).toBe("3d8");
  });

  // Fireball: no type stored, the one roll grows.
  it("grows every roll when the upcast names no type", () => {
    const fireball = { dice: "8d6", type: "fire" };
    expect(slotScaledDamageDice(fireball, 2, { dice_per_level: "1d6", type: null })).toBe("10d6");
  });

  it("does not grow at the spell's own slot or without upcast dice", () => {
    expect(slotScaledDamageDice(bludgeoning, 0, higher)).toBe("2d8");
    expect(slotScaledDamageDice(bludgeoning, 2, null)).toBe("2d8");
  });
});

describe("castDamageRolls", () => {
  const iceStorm = { level: 4, damage_rolls: [bludgeoning, cold], higher_level_damage: higher };

  // Bug: the encounter runner grew both parts, so Ice Storm at 5th rolled 3d8 + 4d6+1d8 there and 3d8 + 4d6 on the sheet.
  it("grows only the named part of a two-part spell at a higher slot", () => {
    expect(castDamageRolls(iceStorm, 5, 9).map((roll) => roll.dice)).toEqual(["3d8", "4d6"]);
  });

  // SRD 5.1 Fire Bolt: 1d10, "increases by 1d10 when you reach 5th level (2d10)".
  it("multiplies a cantrip's dice by the caster's level step", () => {
    const fireBolt = { level: 0, damage_rolls: [{ dice: "1d10", type: "fire" }], higher_level_damage: null };
    expect(castDamageRolls(fireBolt, 0, 4)[0].dice).toBe("1d10");
    expect(castDamageRolls(fireBolt, 0, 5)[0].dice).toBe("2d10");
  });
});
