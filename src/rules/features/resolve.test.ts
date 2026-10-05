import { describe, expect, it } from "vitest";
import type { DamageRider, FeatureChoice, FeatureMechanics, FeatureUses } from "./mechanics.types";
import {
  choicePicksDue,
  costsOf,
  rechargeAt,
  restoredAfterRest,
  ridersFor,
  riderDice,
  scalingAt,
  usesMaxAt,
  valueAtLevel,
} from "./resolve";

const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const ctx = (classLevel: number, over: Partial<typeof scores> = {}, pb = 2) => ({
  classLevel,
  proficiencyBonus: pb,
  abilityScores: { ...scores, ...over },
});

const sneak = {
  label: "Sneak Attack",
  values: { "1": "1d6", "3": "2d6", "5": "3d6", "7": "4d6", "9": "5d6", "11": "6d6", "13": "7d6", "15": "8d6", "17": "9d6", "19": "10d6" },
};

describe("valueAtLevel", () => {
  it("reads the nearest listed level at or below", () => {
    expect(valueAtLevel({ "2": "a", "5": "b" }, 4)).toBe("a");
    expect(valueAtLevel({ "2": "a", "5": "b" }, 5)).toBe("b");
    expect(valueAtLevel({ "2": "a", "5": "b" }, 20)).toBe("b");
  });
  it("is null below the first listed level", () => {
    expect(valueAtLevel({ "2": "a" }, 1)).toBeNull();
  });
});

describe("scalingAt", () => {
  it("matches the 2014 Rogue Sneak Attack table", () => {
    expect(scalingAt(sneak, 1)).toBe("1d6");
    expect(scalingAt(sneak, 2)).toBe("1d6");
    expect(scalingAt(sneak, 3)).toBe("2d6");
    expect(scalingAt(sneak, 18)).toBe("9d6");
    expect(scalingAt(sneak, 19)).toBe("10d6");
    expect(scalingAt(sneak, 20)).toBe("10d6");
  });
  it("is null before the feature scales", () => {
    expect(scalingAt({ label: "x", values: { "5": "1d4" } }, 4)).toBeNull();
  });
});

describe("usesMaxAt", () => {
  const rage: FeatureUses = {
    key: "rage",
    label: "Rage",
    recharge: "long",
    pool: false,
    amount: {
      kind: "unlimited_from",
      level: 20,
      below: { kind: "by_level", values: { "1": 2, "3": 3, "6": 4, "12": 5, "17": 6 } },
    },
  };
  it("2014 Barbarian rage climbs to unlimited at 20", () => {
    expect(usesMaxAt(rage, ctx(1))).toBe(2);
    expect(usesMaxAt(rage, ctx(11))).toBe(4);
    expect(usesMaxAt(rage, ctx(19))).toBe(6);
    expect(usesMaxAt(rage, ctx(20))).toBe("unlimited");
  });
  it("by_level is 0 below the first listed level", () => {
    const u: FeatureUses = { ...rage, amount: { kind: "by_level", values: { "3": 1 } } };
    expect(usesMaxAt(u, ctx(2))).toBe(0);
  });
  it("Bardic Inspiration uses the Charisma modifier, minimum 1", () => {
    const bi: FeatureUses = {
      key: "bardic_inspiration",
      label: "Bardic Inspiration",
      recharge: "long",
      recharge_from: { level: 5, recharge: "short" },
      pool: false,
      amount: { kind: "ability_mod", ability: "cha", min: 1 },
    };
    expect(usesMaxAt(bi, ctx(1, { cha: 8 }))).toBe(1);
    expect(usesMaxAt(bi, ctx(1, { cha: 10 }))).toBe(1);
    expect(usesMaxAt(bi, ctx(1, { cha: 18 }))).toBe(4);
    expect(rechargeAt(bi, 4)).toBe("long");
    expect(rechargeAt(bi, 5)).toBe("short");
    expect(rechargeAt(bi, 20)).toBe("short");
  });
  it("ability_mod adds its bonus before the minimum (2014 Divine Sense)", () => {
    const ds: FeatureUses = {
      key: "divine_sense",
      label: "Divine Sense",
      recharge: "long",
      pool: false,
      amount: { kind: "ability_mod", ability: "cha", min: 1, bonus: 1 },
    };
    expect(usesMaxAt(ds, ctx(1, { cha: 8 }))).toBe(1); // -1 + 1 = 0, floored to 1
    expect(usesMaxAt(ds, ctx(1, { cha: 10 }))).toBe(1);
    expect(usesMaxAt(ds, ctx(1, { cha: 16 }))).toBe(4);
    const penalty: FeatureUses = { ...ds, amount: { kind: "ability_mod", ability: "cha", min: 0, bonus: -1 } };
    expect(usesMaxAt(penalty, ctx(1, { cha: 18 }))).toBe(3);
    expect(usesMaxAt(penalty, ctx(1, { cha: 10 }))).toBe(0);
  });
  it("Lay on Hands is a pool of 5 per Paladin level", () => {
    const loh: FeatureUses = {
      key: "lay_on_hands",
      label: "Lay on Hands",
      recharge: "long",
      pool: true,
      amount: { kind: "class_level", multiplier: 5 },
    };
    expect(usesMaxAt(loh, ctx(1))).toBe(5);
    expect(usesMaxAt(loh, ctx(7))).toBe(35);
  });
  it("proficiency follows the bonus", () => {
    const u: FeatureUses = { key: "p", label: "P", recharge: "long", pool: false, amount: { kind: "proficiency" } };
    expect(usesMaxAt(u, ctx(9, {}, 4))).toBe(4);
  });
  it("fixed", () => {
    const u: FeatureUses = { key: "f", label: "F", recharge: "short", pool: false, amount: { kind: "fixed", value: 1 } };
    expect(usesMaxAt(u, ctx(1))).toBe(1);
    expect(rechargeAt(u, 20)).toBe("short");
  });
});

describe("riderDice", () => {
  const smite: DamageRider = {
    label: "Divine Smite",
    dice: { kind: "slot", base: "2d8", base_level: 1, per_level: "1d8", max_dice: 5 },
    applies_to: "melee_weapon",
    once_per_turn: false,
    cost: { kind: "spell_slot" },
  };
  it("2014 Divine Smite grows with the slot and caps at 5d8", () => {
    expect(riderDice(smite, { scalingValue: null, slotLevel: 1 })).toBe("2d8");
    expect(riderDice(smite, { scalingValue: null, slotLevel: 2 })).toBe("3d8");
    expect(riderDice(smite, { scalingValue: null, slotLevel: 4 })).toBe("5d8");
    expect(riderDice(smite, { scalingValue: null, slotLevel: 5 })).toBe("5d8");
  });
  it("is null with no slot or a slot below the base", () => {
    expect(riderDice(smite, { scalingValue: null })).toBeNull();
    const high = { ...smite, dice: { ...smite.dice, base_level: 3 } } as DamageRider;
    expect(riderDice(high, { scalingValue: null, slotLevel: 2 })).toBeNull();
  });
  it("scaling reads the feature's value; fixed reads the expression", () => {
    const s: DamageRider = { label: "SA", dice: { kind: "scaling" }, applies_to: "weapon", once_per_turn: true };
    expect(riderDice(s, { scalingValue: "3d6" })).toBe("3d6");
    expect(riderDice(s, { scalingValue: null })).toBeNull();
    const f: DamageRider = { ...s, dice: { kind: "fixed", expression: "1d6" } };
    expect(riderDice(f, { scalingValue: "3d6" })).toBe("1d6");
  });
});

describe("ridersFor", () => {
  const mk = (applies_to: DamageRider["applies_to"], requires_toggle?: string): DamageRider => ({
    label: applies_to,
    dice: { kind: "fixed", expression: "1d6" },
    applies_to,
    once_per_turn: false,
    requires_toggle,
  });
  const all = [mk("weapon"), mk("melee_weapon"), mk("melee_strength"), mk("finesse_or_ranged"), mk("unarmed"), mk("spell")];
  const labels = (r: DamageRider[]) => r.map((x) => x.label);
  const none = new Set<string>();

  it("a Strength melee weapon", () => {
    const a = { kind: "weapon", melee: true, finesse: false, ranged: false, usesStrength: true } as const;
    expect(labels(ridersFor(all, a, none))).toEqual(["weapon", "melee_weapon", "melee_strength"]);
  });
  it("a finesse weapon used with Dexterity", () => {
    const a = { kind: "weapon", melee: true, finesse: true, ranged: false, usesStrength: false } as const;
    expect(labels(ridersFor(all, a, none))).toEqual(["weapon", "melee_weapon", "finesse_or_ranged"]);
  });
  it("a ranged weapon", () => {
    const a = { kind: "weapon", melee: false, finesse: false, ranged: true, usesStrength: false } as const;
    expect(labels(ridersFor(all, a, none))).toEqual(["weapon", "finesse_or_ranged"]);
  });
  it("unarmed and spell", () => {
    expect(labels(ridersFor(all, { kind: "unarmed" }, none))).toEqual(["unarmed"]);
    expect(labels(ridersFor(all, { kind: "spell" }, none))).toEqual(["spell"]);
  });
  it("hides riders whose toggle is off", () => {
    const rage = mk("melee_strength", "rage");
    const a = { kind: "weapon", melee: true, finesse: false, ranged: false, usesStrength: true } as const;
    expect(ridersFor([rage], a, none)).toEqual([]);
    expect(ridersFor([rage], a, new Set(["rage"]))).toEqual([rage]);
  });
});

describe("choicePicksDue", () => {
  const expertise: FeatureChoice = {
    key: "expertise",
    label: "Expertise",
    pick: { kind: "expertise", thieves_tools: true },
    count: { kind: "per_grant", amount: 2 },
    replace_on_level_up: false,
  };
  const asi: FeatureChoice = {
    key: "asi",
    label: "ASI",
    pick: { kind: "asi_or_feat" },
    count: { kind: "per_grant", amount: 1 },
    replace_on_level_up: false,
  };
  const invocations: FeatureChoice = {
    key: "eldritch_invocations",
    label: "Eldritch Invocations",
    pick: { kind: "option", set: "eldritch_invocation" },
    count: { kind: "known", values: { "2": 2, "5": 3, "7": 4, "9": 5, "12": 6, "15": 7, "18": 8 } },
    replace_on_level_up: true,
  };
  it("Rogue Expertise: two at level 1 and two more at 6", () => {
    const g = { levelsGranted: [1, 6] };
    expect(choicePicksDue(expertise, { ...g, fromLevel: 0, toLevel: 1 })).toBe(2);
    expect(choicePicksDue(expertise, { ...g, fromLevel: 1, toLevel: 5 })).toBe(0);
    expect(choicePicksDue(expertise, { ...g, fromLevel: 5, toLevel: 6 })).toBe(2);
    expect(choicePicksDue(expertise, { ...g, fromLevel: 0, toLevel: 6 })).toBe(4);
  });
  it("2014 ASI at 4, 8, 12, 16, 19", () => {
    const g = { levelsGranted: [4, 8, 12, 16, 19] };
    expect(choicePicksDue(asi, { ...g, fromLevel: 3, toLevel: 4 })).toBe(1);
    expect(choicePicksDue(asi, { ...g, fromLevel: 4, toLevel: 7 })).toBe(0);
    expect(choicePicksDue(asi, { ...g, fromLevel: 0, toLevel: 20 })).toBe(5);
  });
  it("Warlock invocations are the difference between known counts", () => {
    const g = { levelsGranted: [2] };
    expect(choicePicksDue(invocations, { ...g, fromLevel: 0, toLevel: 1 })).toBe(0);
    expect(choicePicksDue(invocations, { ...g, fromLevel: 1, toLevel: 2 })).toBe(2);
    expect(choicePicksDue(invocations, { ...g, fromLevel: 2, toLevel: 5 })).toBe(1);
    expect(choicePicksDue(invocations, { ...g, fromLevel: 5, toLevel: 6 })).toBe(0);
    expect(choicePicksDue(invocations, { ...g, fromLevel: 0, toLevel: 20 })).toBe(8);
  });
  it("never goes negative", () => {
    expect(choicePicksDue(invocations, { levelsGranted: [2], fromLevel: 20, toLevel: 2 })).toBe(0);
  });
});

describe("restoredAfterRest", () => {
  it("a long rest refills everything, turn and dawn included", () => {
    for (const rest of ["short", "long", "turn", "dawn"] as const) {
      expect(restoredAfterRest({ current: 0, max: 3, rest }, "long")).toBe(3);
    }
  });
  it("a short rest refills short and turn resources", () => {
    expect(restoredAfterRest({ current: 0, max: 3, rest: "short" }, "short")).toBe(3);
    expect(restoredAfterRest({ current: 0, max: 3, rest: "turn" }, "short")).toBe(3);
  });
  it("2024 Rage: long, but a short rest gives back one", () => {
    const rage = { current: 0, max: 4, rest: "long", short_rest_regain: 1 } as const;
    expect(restoredAfterRest(rage, "short")).toBe(1);
    expect(restoredAfterRest({ ...rage, current: 4 }, "short")).toBe(4);
    expect(restoredAfterRest({ ...rage, current: 3 }, "short")).toBe(4);
  });
  it("leaves long and dawn resources alone on a short rest", () => {
    expect(restoredAfterRest({ current: 1, max: 3, rest: "long" }, "short")).toBe(1);
    expect(restoredAfterRest({ current: 1, max: 3, rest: "dawn" }, "short")).toBe(1);
  });
});

describe("costsOf", () => {
  it("is empty for a free feature", () => {
    expect(costsOf({ activation: "action" })).toEqual([]);
  });
  it("collects the feature's, toggle's, sub-actions' and riders' pool spends once each", () => {
    const m: FeatureMechanics = {
      spends: { key: "channel_divinity", amount: 1 },
      toggle: { key: "t", label: "T", ends_on: "short_rest", spends: { key: "rage_uses", amount: 1 } },
      actions: [
        { name: "Flurry", activation: "bonus_action", spends: { key: "ki_points", amount: 1 } },
        { name: "Step", activation: "bonus_action", spends: { key: "ki_points", amount: 1 } },
        { name: "Body", activation: "action", spends: { key: "ki_points", amount: 4 } },
        { name: "Free", activation: "action" },
      ],
      riders: [
        { label: "Slot", dice: { kind: "fixed", expression: "1d8" }, applies_to: "weapon", once_per_turn: false, cost: { kind: "spell_slot" } },
        { label: "Ki", dice: { kind: "fixed", expression: "1d8" }, applies_to: "weapon", once_per_turn: false, cost: { kind: "uses", key: "ki_points", amount: 1 } },
        { label: "Sorc", dice: { kind: "fixed", expression: "1d8" }, applies_to: "weapon", once_per_turn: false, cost: { kind: "uses", key: "sorcery_points", amount: 2 } },
      ],
    };
    expect(costsOf(m)).toEqual([
      { key: "channel_divinity", amount: 1 },
      { key: "rage_uses", amount: 1 },
      { key: "ki_points", amount: 1 },
      { key: "ki_points", amount: 4 },
      { key: "sorcery_points", amount: 2 },
    ]);
  });
});
