import { describe, it, expect } from "vitest";
import {
  abilityMod,
  signedNum,
  weaponAbilityMod,
  weaponAttackMod,
  weaponDamageExpr,
  weaponDamageType,
  weaponDamageParsedExpression,
  unarmedAttackMod,
  unarmedDamage,
  improvisedAttackMod,
  type WeaponLike,
} from "@/lib/weaponAttack";

function weapon(overrides: Partial<WeaponLike> = {}): WeaponLike {
  return {
    properties: [],
    damage_rolls: [{ dice: "1d8", type: "slashing" }],
    ...overrides,
  };
}

describe("abilityMod / signedNum", () => {
  it("floors (score - 10) / 2", () => {
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(20)).toBe(5);
  });

  it("signs positive/zero with + and leaves negative as-is (hyphen-minus)", () => {
    expect(signedNum(7)).toBe("+7");
    expect(signedNum(0)).toBe("+0");
    expect(signedNum(-2)).toBe("-2");
  });
});

describe("weaponAbilityMod", () => {
  it("uses STR for a plain weapon", () => {
    const w = weapon({ properties: [] });
    expect(weaponAbilityMod(w, { str: 16, dex: 10 })).toBe(3); // STR mod
  });

  it("finesse picks DEX when DEX > STR", () => {
    const w = weapon({ properties: ["finesse"] });
    expect(weaponAbilityMod(w, { str: 10, dex: 18 })).toBe(4); // DEX mod
  });

  it("finesse picks STR when STR >= DEX", () => {
    const w = weapon({ properties: ["finesse"] });
    expect(weaponAbilityMod(w, { str: 16, dex: 10 })).toBe(3); // STR mod, tie/greater goes to STR
  });

  it("ammunition weapons always use DEX, even if STR is higher", () => {
    const w = weapon({ properties: ["ammunition"] });
    expect(weaponAbilityMod(w, { str: 18, dex: 10 })).toBe(0); // DEX mod, not STR's +4
  });

  it("custom weapon (item === null) uses the better of STR/DEX, like improvised", () => {
    expect(weaponAbilityMod(null, { str: 8, dex: 14 })).toBe(2); // DEX mod
    expect(weaponAbilityMod(null, { str: 16, dex: 10 })).toBe(3); // STR mod
  });
});

describe("weaponAttackMod", () => {
  it("adds proficiency bonus on top of the ability mod (equipped weapons assumed proficient)", () => {
    const w = weapon({ properties: [] });
    expect(weaponAttackMod(w, { str: 16, dex: 10, proficiencyBonus: 3 })).toBe(6); // +3 STR +3 PB
  });

  it("produces a negative modifier for a low ability score", () => {
    const w = weapon({ properties: [] });
    expect(weaponAttackMod(w, { str: 8, dex: 10, proficiencyBonus: 2 })).toBe(1); // -1 STR +2 PB
    expect(weaponAttackMod(w, { str: 6, dex: 8, proficiencyBonus: 0 })).toBe(-2); // -2 STR +0 PB
  });

  it("custom/equipped weapon with no vault stats still gets proficiency (unlike the standalone improvised action)", () => {
    expect(weaponAttackMod(null, { str: 8, dex: 14, proficiencyBonus: 2 })).toBe(4); // +2 DEX +2 PB
  });
});

describe("weaponDamageExpr", () => {
  it("returns the raw expression unchanged when the ability mod is zero", () => {
    const w = weapon({ properties: [], damage_rolls: [{ dice: "1d8", type: "slashing" }] });
    expect(weaponDamageExpr(w, { str: 10, dex: 10 })).toBe("1d8");
  });

  it("appends a positive modifier", () => {
    const w = weapon({ properties: [], damage_rolls: [{ dice: "1d8", type: "slashing" }] });
    expect(weaponDamageExpr(w, { str: 14, dex: 10 })).toBe("1d8+2");
  });

  it("appends a negative modifier", () => {
    const w = weapon({ properties: [], damage_rolls: [{ dice: "1d8", type: "slashing" }] });
    expect(weaponDamageExpr(w, { str: 8, dex: 10 })).toBe("1d8-1");
  });

  it("folds an existing flat modifier in the dice string with the ability mod", () => {
    const w = weapon({ properties: [], damage_rolls: [{ dice: "1d8+1", type: "slashing" }] });
    expect(weaponDamageExpr(w, { str: 14, dex: 10 })).toBe("1d8+3");
  });

  it("versatile weapons still use damage_rolls[0] only — no special-cased two-handed string", () => {
    const w = weapon({
      properties: ["versatile"],
      damage_rolls: [{ dice: "1d8", type: "slashing" }],
    });
    expect(weaponDamageExpr(w, { str: 14, dex: 10 })).toBe("1d8+2");
  });

  it("plain (non-versatile) weapon with a finesse property picks the better ability score for damage too", () => {
    const w = weapon({ properties: ["finesse"], damage_rolls: [{ dice: "1d6", type: "piercing" }] });
    expect(weaponDamageExpr(w, { str: 10, dex: 18 })).toBe("1d6+4");
  });

  it("custom weapon (no vault stats) falls back to improvised 1d4 plus best ability mod", () => {
    expect(weaponDamageExpr(null, { str: 8, dex: 14 })).toBe("1d4+2");
  });

  it("returns the fallback raw string unparsed if unparseable", () => {
    const w = weapon({ properties: [], damage_rolls: [{ dice: "not-a-dice-expr", type: "fire" }] });
    expect(weaponDamageExpr(w, { str: 14, dex: 10 })).toBe("not-a-dice-expr");
  });
});

describe("weaponDamageType", () => {
  it("reads the first damage roll's type", () => {
    expect(weaponDamageType(weapon({ damage_rolls: [{ dice: "1d8", type: "slashing" }] }))).toBe("slashing");
  });

  it("defaults to bludgeoning for a custom weapon with no vault stats", () => {
    expect(weaponDamageType(null)).toBe("bludgeoning");
  });
});

describe("weaponDamageParsedExpression", () => {
  it("parses the real weapon's dice string", () => {
    const w = weapon({ damage_rolls: [{ dice: "2d6", type: "slashing" }] });
    expect(weaponDamageParsedExpression(w)).toEqual({ terms: [{ count: 2, sides: 6 }], modifier: 0 });
  });

  it("falls back to a bare 1d4 for a custom/no-vault-stats weapon", () => {
    expect(weaponDamageParsedExpression(null)).toEqual({ terms: [{ count: 1, sides: 4 }], modifier: 0 });
    expect(weaponDamageParsedExpression(weapon({ damage_rolls: [] }))).toEqual({
      terms: [{ count: 1, sides: 4 }],
      modifier: 0,
    });
  });

  it("returns null when the item has real damage_rolls but the dice string is unparseable", () => {
    const w = weapon({ damage_rolls: [{ dice: "bogus", type: "fire" }] });
    expect(weaponDamageParsedExpression(w)).toBeNull();
  });
});

describe("unarmed / improvised", () => {
  it("unarmedAttackMod adds STR + proficiency", () => {
    expect(unarmedAttackMod(16, 3)).toBe(6);
    expect(unarmedAttackMod(8, 2)).toBe(1); // negative STR mod plus PB
  });

  it("unarmedDamage is 1 + STR mod, floored at 1", () => {
    expect(unarmedDamage(16)).toBe(4);
    expect(unarmedDamage(8)).toBe(1); // 1 + (-1) = 0, clamped to 1
    expect(unarmedDamage(10)).toBe(1);
  });

  it("improvisedAttackMod is the better of STR/DEX with NO proficiency bonus", () => {
    expect(improvisedAttackMod(8, 14)).toBe(2); // DEX mod, no PB added
    expect(improvisedAttackMod(16, 10)).toBe(3); // STR mod, no PB added
  });
});
