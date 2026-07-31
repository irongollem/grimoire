import { describe, expect, it } from "vitest";
import { grantAttackBonus, grantSaveDc } from "@/rules/spellGrantStats";

const member = { proficiency_bonus: 3, int: 10, wis: 10, cha: 16 };
const classStats = { attack: 7, dc: 15 };

describe("grantAttackBonus", () => {
  it("derives from casting_ability + proficiency when it is set", () => {
    const grant = { casting_ability: "cha" as const };
    // prof 3 + floor((16-10)/2) = 3 + 3 = 6
    expect(grantAttackBonus(grant, member, classStats, 4)).toBe(6);
  });

  it("falls back to the source class's computed attack when casting_ability is not set", () => {
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
  it("derives from casting_ability + proficiency when it is set", () => {
    const grant = { casting_ability: "cha" as const };
    // 8 + prof 3 + floor((16-10)/2) = 8 + 3 + 3 = 14
    expect(grantSaveDc(grant, member, classStats, 12)).toBe(14);
  });

  it("falls back to the source class's computed dc when casting_ability is not set", () => {
    expect(grantSaveDc({}, member, classStats, 12)).toBe(15);
  });

  it("falls back to the caller-supplied fallback when there is no class stats row either", () => {
    expect(grantSaveDc({}, member, null, 12)).toBe(12);
  });
});
