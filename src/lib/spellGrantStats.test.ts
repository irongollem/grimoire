import { describe, expect, it } from "vitest";
import { grantAttackBonus, grantSaveDc } from "./spellGrantStats";

const member = { proficiency_bonus: 3, int: 10, wis: 10, cha: 16 };
const classStats = { attack: 7, dc: 15 };

describe("grantAttackBonus", () => {
  it("uses fixed_attack_bonus when both fixed fields are set", () => {
    const grant = { fixed_attack_bonus: 9, fixed_save_dc: 20, casting_ability: "cha" as const };
    expect(grantAttackBonus(grant, member, classStats, 4)).toBe(9);
  });

  it("uses fixed_attack_bonus alone, independent of casting_ability", () => {
    const grant = { fixed_attack_bonus: 9, casting_ability: "cha" as const };
    expect(grantAttackBonus(grant, member, classStats, 4)).toBe(9);
  });

  it("derives from casting_ability + proficiency when no fixed bonus is set", () => {
    const grant = { casting_ability: "cha" as const };
    // prof 3 + floor((16-10)/2) = 3 + 3 = 6
    expect(grantAttackBonus(grant, member, classStats, 4)).toBe(6);
  });

  it("falls back to the source class's computed attack when neither fixed nor casting_ability is set", () => {
    expect(grantAttackBonus({}, member, classStats, 4)).toBe(7);
  });

  it("falls back to the caller-supplied fallback when there is no class stats row either", () => {
    expect(grantAttackBonus({}, member, null, 4)).toBe(4);
  });

  it("skips the casting_ability branch when member is unavailable, falling through to class stats", () => {
    const grant = { casting_ability: "cha" as const };
    expect(grantAttackBonus(grant, null, classStats, 4)).toBe(7);
  });
});

describe("grantSaveDc", () => {
  it("uses fixed_save_dc when both fixed fields are set", () => {
    const grant = { fixed_attack_bonus: 9, fixed_save_dc: 20, casting_ability: "cha" as const };
    expect(grantSaveDc(grant, member, classStats, 12)).toBe(20);
  });

  it("is independent of fixed_attack_bonus — a fixed attack alone does not fix the DC", () => {
    const grant = { fixed_attack_bonus: 9 };
    // No fixed_save_dc, no casting_ability → falls through to class stats, NOT 8 + fixed attack.
    expect(grantSaveDc(grant, member, classStats, 12)).toBe(15);
  });

  it("derives from casting_ability + proficiency when no fixed DC is set", () => {
    const grant = { casting_ability: "cha" as const };
    // 8 + prof 3 + floor((16-10)/2) = 8 + 3 + 3 = 14
    expect(grantSaveDc(grant, member, classStats, 12)).toBe(14);
  });

  it("falls back to the source class's computed dc when neither fixed nor casting_ability is set", () => {
    expect(grantSaveDc({}, member, classStats, 12)).toBe(15);
  });

  it("falls back to the caller-supplied fallback when there is no class stats row either", () => {
    expect(grantSaveDc({}, member, null, 12)).toBe(12);
  });
});
