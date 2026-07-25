import { describe, it, expect } from "vitest";
import {
  applyDamage,
  applyHealing,
  betterTempHp,
  displayTempHp,
  type HpPools,
  type TempHpCombatant,
  type TempHpPartyMember,
} from "@/lib/hitPoints";

function pools(over: Partial<HpPools> = {}): HpPools {
  return { current_hp: 30, max_hp: 40, temp_hp: 0, beast: null, ...over };
}

describe("applyDamage", () => {
  it("takes damage off HP when there is no temp HP", () => {
    const r = applyDamage(pools(), 12);
    expect(r.current_hp).toBe(18);
    expect(r.temp_hp).toBe(0);
    expect(r.hp_damage).toBe(12);
  });

  it("spends temp HP before HP", () => {
    const r = applyDamage(pools({ temp_hp: 5 }), 12);
    expect(r.temp_hp).toBe(0);
    expect(r.current_hp).toBe(23);
    expect(r.hp_damage).toBe(7);
  });

  it("leaves HP untouched when temp HP absorbs the whole hit", () => {
    const r = applyDamage(pools({ temp_hp: 10 }), 4);
    expect(r.temp_hp).toBe(6);
    expect(r.current_hp).toBe(30);
    expect(r.hp_damage).toBe(0);
  });

  it("floors HP at 0 by default", () => {
    expect(applyDamage(pools({ current_hp: 5 }), 40).current_hp).toBe(0);
  });

  it("honours a negative floor for the party tracker's overkill display", () => {
    expect(applyDamage(pools({ current_hp: 5 }), 100, -40).current_hp).toBe(-40);
  });

  describe("while wildshaped", () => {
    const wild = (over: Partial<HpPools> = {}) =>
      pools({ beast: { hp: 20, max_hp: 20 }, ...over });

    it("spends temp HP before the beast's HP", () => {
      const r = applyDamage(wild({ temp_hp: 5 }), 12);
      expect(r.temp_hp).toBe(0);
      expect(r.beast_hp).toBe(13);
      expect(r.current_hp).toBe(30);
      expect(r.reverted).toBe(false);
    });

    it("keeps the character's own HP intact while the form stands", () => {
      const r = applyDamage(wild(), 19);
      expect(r.beast_hp).toBe(1);
      expect(r.current_hp).toBe(30);
    });

    it("reverts and carries the overflow to the character's HP", () => {
      const r = applyDamage(wild(), 25);
      expect(r.reverted).toBe(true);
      expect(r.beast_hp).toBeNull();
      expect(r.current_hp).toBe(25); // 5 overflow
    });

    it("counts temp HP against the overflow, not just the beast pool", () => {
      const r = applyDamage(wild({ temp_hp: 8 }), 30);
      // 8 absorbed → 22 to the beast → 2 overflow
      expect(r.temp_hp).toBe(0);
      expect(r.reverted).toBe(true);
      expect(r.current_hp).toBe(28);
    });

    it("reverts exactly at 0 without touching the character's HP", () => {
      const r = applyDamage(wild(), 20);
      expect(r.reverted).toBe(true);
      expect(r.current_hp).toBe(30);
    });
  });
});

describe("applyHealing", () => {
  it("caps at max HP", () => {
    expect(applyHealing(pools({ current_hp: 35 }), 20).current_hp).toBe(40);
  });

  it("heals the beast form, capped at the beast's max", () => {
    const r = applyHealing(pools({ beast: { hp: 4, max_hp: 20 } }), 30);
    expect(r.beast_hp).toBe(20);
    expect(r.current_hp).toBe(30);
  });

  it("never adds to temp HP", () => {
    const r = applyHealing(pools({ current_hp: 30, temp_hp: 5 }), 5);
    expect(r.current_hp).toBe(35);
  });
});

describe("betterTempHp", () => {
  it("keeps the larger pool — temp HP does not stack", () => {
    expect(betterTempHp(8, 5)).toBe(8);
    expect(betterTempHp(3, 9)).toBe(9);
  });

  it("ignores negative input", () => {
    expect(betterTempHp(4, -2)).toBe(4);
  });
});

describe("displayTempHp", () => {
  const member = (temp_hp: number): TempHpPartyMember => ({ temp_hp });

  it("reads the combatant's own temp_hp for non-players", () => {
    const c: TempHpCombatant = { type: "monster", temp_hp: 7 };
    expect(displayTempHp(c, new Map())).toBe(7);
  });

  it("defaults to 0 for a non-player with no temp_hp", () => {
    const c: TempHpCombatant = { type: "monster" };
    expect(displayTempHp(c, new Map())).toBe(0);
  });

  it("prefers the live party row for players", () => {
    const c: TempHpCombatant = { type: "player", party_member_id: "m1", temp_hp: 3 };
    const partyMap = new Map([["m1", member(9)]]);
    expect(displayTempHp(c, partyMap)).toBe(9);
  });

  it("falls back to the combatant's own temp_hp when the player isn't in the party map", () => {
    const c: TempHpCombatant = { type: "player", party_member_id: "missing", temp_hp: 4 };
    expect(displayTempHp(c, new Map())).toBe(4);
  });
});
