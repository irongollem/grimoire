import { describe, expect, it } from "vitest";
import { describeResolved, effectDamageRoll, resolveEffect, type EffectContext } from "./effect";
import type { FeatureEffect } from "./mechanics.types";

const ctx = (over: Partial<EffectContext> = {}): EffectContext => ({
  classLevel: 10,
  proficiencyBonus: 4,
  abilityMods: { str: 0, dex: 2, con: 1, int: 3, wis: 0, cha: 4 },
  spell: { dc: 15, attack: 7 },
  ...over,
});

const thunder: FeatureEffect = {
  kind: "save",
  save: { ability: "con", dc_ability: "cha", success: "none" },
  dice: { "3": "1d6", "10": "2d6" },
  damage_type: "thunder",
};

function resolved(effect: FeatureEffect, c: EffectContext) {
  const r = resolveEffect(effect, c);
  if (!r.ok) throw new Error(r.reason);
  return r.effect;
}

describe("resolveEffect", () => {
  it("works out a save DC from the named ability and reads the dice at the level", () => {
    const e = resolved(thunder, ctx());
    expect(e.save).toEqual({ ability: "con", dc: 16, success: "none" });
    expect(e.damage).toMatchObject({ base: "2d6", modifier: 0, label: "2d6", type: "thunder" });
    expect(resolved(thunder, ctx({ classLevel: 5 })).damage?.base).toBe("1d6");
  });

  it("has nothing to roll below the first listed level", () => {
    expect(resolveEffect(thunder, ctx({ classLevel: 2 }))).toEqual({ ok: false, reason: "Available from level 3" });
  });

  it("uses the granting class's spell DC and attack for 'spell'", () => {
    const cannon: FeatureEffect = {
      kind: "save",
      save: { ability: "dex", dc_ability: "spell", success: "half" },
      dice: { "3": "2d8" },
      damage_type: "fire",
      area: "15-ft cone",
    };
    const e = resolved(cannon, ctx());
    expect(e.save?.dc).toBe(15);
    expect(e.area).toBe("15-ft cone");
    const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "ranged", ability: "spell", range: "120 ft" }, dice: { "1": "1d10" } };
    expect(resolved(bolt, ctx()).toHit).toBe(7);
  });

  it("says why a 'spell' effect cannot resolve without spellcasting", () => {
    const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "ranged", ability: "spell" } };
    expect(resolveEffect(bolt, ctx({ spell: null }))).toEqual({ ok: false, reason: "Needs a spellcasting class" });
    expect(resolveEffect({ kind: "save", save: { ability: "wis", dc_ability: "spell", success: "none" } }, ctx({ spell: null })).ok).toBe(false);
  });

  it("attacks with proficiency plus the ability's modifier", () => {
    const strike: FeatureEffect = { kind: "attack", attack: { delivery: "melee", ability: "dex" }, dice: { "1": "1d8" } };
    expect(resolved(strike, ctx()).toHit).toBe(6);
  });

  it("adds ability, proficiency and class level to the total", () => {
    const heal: FeatureEffect = {
      kind: "heal",
      dice: { "1": "1d8" },
      add: [{ kind: "ability", ability: "wis" }, { kind: "ability", ability: "cha" }, { kind: "proficiency" }, { kind: "class_level" }],
    };
    expect(resolved(heal, ctx()).damage).toMatchObject({ base: "1d8", modifier: 18, label: "1d8+18", type: null });
  });

  it("rolls a flat value with no dice", () => {
    const flat: FeatureEffect = { kind: "heal", dice: { "1": "5" }, add: [{ kind: "class_level" }] };
    const d = resolved(flat, ctx()).damage!;
    expect(d.label).toBe("15");
    expect(effectDamageRoll(d, false)).toMatchObject({ counts: {}, modifier: 15 });
  });

  it("doubles the dice and not the modifier on a critical hit", () => {
    const strike: FeatureEffect = { kind: "damage", dice: { "1": "2d6" }, add: [{ kind: "ability", ability: "cha" }] };
    const d = resolved(strike, ctx()).damage!;
    expect(effectDamageRoll(d, true)).toMatchObject({ counts: { 6: 4 }, modifier: 4, parts: ["4d6", "+4"] });
    expect(effectDamageRoll(d, false)).toMatchObject({ counts: { 6: 2 }, modifier: 4 });
  });

  it("leaves damage null for a save that only imposes something", () => {
    const e = resolved({ kind: "save", save: { ability: "wis", dc_ability: "cha", success: "none" } }, ctx());
    expect(e.damage).toBeNull();
  });
});

describe("describeResolved", () => {
  it("reads like the sheet's one-liners", () => {
    expect(describeResolved(resolved(thunder, ctx()))).toBe("DC 16 Con save · 2d6 thunder");
    expect(
      describeResolved(resolved({ kind: "attack", attack: { delivery: "ranged", ability: "spell", range: "120 ft" }, dice: { "1": "2d8" }, damage_type: "force" }, ctx())),
    ).toBe("+7 to hit · 2d8 force · 120 ft");
    expect(describeResolved(resolved({ kind: "heal", dice: { "1": "1d8" }, add: [{ kind: "ability", ability: "wis" }] }, ctx()))).toBe("Heals 1d8");
    expect(
      describeResolved(resolved({ kind: "save", save: { ability: "dex", dc_ability: "spell", success: "half" }, dice: { "1": "2d8" }, area: "15-ft cone" }, ctx())),
    ).toBe("DC 15 Dex save, half on success · 2d8 · 15-ft cone");
  });
});

describe("temporary hit points and floors", () => {
  it("resolves temp_hp like healing and describes it as temporary hit points", () => {
    const e = resolved({ kind: "temp_hp", dice: { "1": "1d8" }, add: [{ kind: "ability", ability: "int" }] }, ctx());
    expect(e.damage).toMatchObject({ base: "1d8", modifier: 3, label: "1d8+3", type: null });
    expect(describeResolved(e)).toBe("Temporary hit points 1d8+3");
  });

  it("twice the proficiency bonus is two proficiency adds", () => {
    const e = resolved({ kind: "temp_hp", add: [{ kind: "proficiency" }, { kind: "proficiency" }] }, ctx());
    expect(e.damage).toMatchObject({ base: "0", modifier: 8, label: "8" });
  });

  it("floors a flat amount in the modifier and states the floor", () => {
    const flat: FeatureEffect = { kind: "heal", add: [{ kind: "ability", ability: "cha" }], min: 1 };
    const low = resolved(flat, ctx({ abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: -1 } }));
    expect(low.damage).toMatchObject({ modifier: 1, min: 1, label: "1" });
    expect(describeResolved(low)).toBe("Heals 1 (minimum 1)");
    expect(resolved(flat, ctx()).damage).toMatchObject({ modifier: 4, min: 1 });
  });

  it("floors the modifier, not the dice, when there are dice", () => {
    const flat: FeatureEffect = { kind: "temp_hp", dice: { "1": "1d4" }, add: [{ kind: "ability", ability: "int" }], min: 5 };
    const e = resolved(flat, ctx());
    expect(e.damage).toMatchObject({ base: "1d4", modifier: 5, min: 5, label: "1d4+5" });
    expect(resolved({ ...flat, min: 2 }, ctx()).damage).toMatchObject({ modifier: 3, label: "1d4+3" });
    expect(effectDamageRoll(e.damage!, true).modifier).toBe(5);
  });

  it("has no floor by default", () => {
    expect(resolved({ kind: "heal", dice: { "1": "1d4" } }, ctx()).damage).toMatchObject({ min: null, modifier: 0 });
  });
});
