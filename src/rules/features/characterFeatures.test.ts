import { describe, expect, it } from "vitest";
import type { ClassFeature } from "@/types/feature.types";
import type { FeatureEffect, FeatureMechanics } from "./mechanics.types";
import {
  actionsByActivation,
  activeToggles,
  classResourcesChanged,
  classResourcesFor,
  damageRidersFor,
  featureIdsNeeded,
  grantedFeatures,
  resourcePools,
  type GrantedClassInput,
} from "./characterFeatures";

function feature(id: string, name: string, mechanics: FeatureMechanics, kind: "feature" | "feat" = "feature"): ClassFeature {
  return { id, name, kind, mechanics } as unknown as ClassFeature;
}

const sneak = feature("sneak", "Sneak Attack", {
  scaling: { label: "Sneak Attack", values: { "1": "1d6", "3": "2d6", "5": "3d6" } },
  riders: [{ label: "Sneak Attack", dice: { kind: "scaling" }, applies_to: "finesse_or_ranged", once_per_turn: true }],
});
const asi = feature("asi", "Ability Score Improvement", {});
const actionSurge = feature("surge", "Action Surge", {
  activation: "special",
  uses: { key: "action_surge", label: "Action Surge", amount: { kind: "by_level", values: { "2": 1, "17": 2 } }, recharge: "short", pool: false },
});
const channelCleric = feature("cd_cleric", "Channel Divinity", {
  uses: { key: "channel_divinity", label: "Channel Divinity", amount: { kind: "by_level", values: { "2": 1, "6": 2, "18": 3 } }, recharge: "short", pool: false },
});
const channelPaladin = feature("cd_paladin", "Channel Divinity (Paladin)", {
  uses: { key: "channel_divinity", label: "Channel Divinity", amount: { kind: "by_level", values: { "3": 1 } }, recharge: "short", pool: false },
});
const bardic = feature("bardic", "Bardic Inspiration", {
  activation: "bonus_action",
  uses: { key: "bardic_inspiration", label: "Bardic Inspiration", amount: { kind: "ability_mod", ability: "cha", min: 1 }, recharge: "long", recharge_from: { level: 5, recharge: "short" }, pool: false },
});
const rage = feature("rage", "Rage", {
  activation: "bonus_action",
  toggle: { key: "rage", label: "Rage", ends_on: "long_rest" },
  uses: { key: "rage", label: "Rage", amount: { kind: "unlimited_from", level: 20, below: { kind: "by_level", values: { "1": 2, "3": 3, "6": 4, "12": 5, "17": 6 } } }, recharge: "long", short_rest_regain: 1, pool: false },
  riders: [{ label: "Rage", dice: { kind: "fixed", expression: "+2" }, applies_to: "melee_strength", once_per_turn: false, requires_toggle: "rage" }],
});
const cunning = feature("cunning", "Cunning Action", {
  activation: "bonus_action",
  actions: [{ name: "Dash", activation: "bonus_action" }, { name: "Stunning", activation: "action", spends: { key: "ki", amount: 1 } }],
});
const grappler = feature("grappler", "Grappler", {}, "feat");
const tough = feature("tough", "Tough", {}, "feat");

const byId = (...fs: ClassFeature[]) => new Map(fs.map((f) => [f.id, f]));
const klass = (over: Partial<GrantedClassInput>): GrantedClassInput => ({
  className: "Rogue", subclassName: null, levels: 5, classMap: null, subclassMap: null, ...over,
});
const base = { classChoices: {}, levelChoices: {}, characterLevel: 5 };
const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const ctx = (over: Partial<typeof scores> = {}, characterLevel = 5) => ({ proficiencyBonus: 3, abilityScores: { ...scores, ...over }, characterLevel });

describe("grantedFeatures", () => {
  it("a Rogue 5 has one Sneak Attack at 3d6 and the ASI gained at 4", () => {
    const out = grantedFeatures({
      ...base,
      classes: [klass({ classMap: { "1": ["sneak"], "4": ["asi"], "8": ["asi"] } })],
      featuresById: byId(sneak, asi),
    });
    expect(out).toHaveLength(2);
    const s = out[0];
    expect(s.scalingValue).toBe("3d6");
    expect(s.grant).toMatchObject({ kind: "class", levelsGained: [1] });
    expect(out[1].grant).toMatchObject({ levelsGained: [4] });
  });

  it("collects every level a repeated id is gained at", () => {
    const out = grantedFeatures({ ...base, classes: [klass({ levels: 9, classMap: { "4": ["asi"], "8": ["asi"] } })], featuresById: byId(asi) });
    expect(out).toHaveLength(1);
    expect(out[0].grant).toMatchObject({ levelsGained: [4, 8] });
  });

  it("keeps class and subclass grants separate and skips unresolvable ids", () => {
    const out = grantedFeatures({
      ...base,
      classes: [klass({ classMap: { "1": ["sneak", "missing"] }, subclassMap: { "3": ["cunning"] }, subclassName: "Thief" })],
      featuresById: byId(sneak, cunning),
    });
    expect(out.map((g) => g.grant.kind)).toEqual(["class", "subclass"]);
  });

  it("lists a repeatable feat taken twice as two entries, with the origin feat marked", () => {
    const out = grantedFeatures({
      classes: [],
      featuresById: byId(tough, grappler),
      classChoices: { feats: ["tough", "grappler", "tough"], origin_feat_id: "tough" },
      levelChoices: { "4": { asi: { feat_id: "grappler" } }, "8": { asi: { feat_id: "tough" } } },
      characterLevel: 8,
    });
    expect(out).toHaveLength(3);
    expect(out[0].grant).toEqual({ kind: "feat", via: "origin", atLevel: null });
    const level = out.slice(1).map((g) => g.grant);
    expect(level).toContainEqual({ kind: "feat", via: "level", atLevel: 4 });
    expect(level).toContainEqual({ kind: "feat", via: "level", atLevel: 8 });
  });

  it("ignores a feats value that is not a string array", () => {
    const out = grantedFeatures({ ...base, classes: [], featuresById: byId(tough), classChoices: { feats: [1, "tough"] } });
    expect(out).toEqual([]);
  });
});

describe("Tasha's swaps", () => {
  const prim = { ...feature("prim", "Primeval Awareness", {}), conceptual_key: "primeval_awareness" } as ClassFeature;
  const natural = feature("natural", "Primal Awareness", { replaces: "primeval_awareness" });
  const ranger = klass({ className: "Ranger", levels: 3, classMap: { "3": ["prim", "natural"] } });

  it("keeps the original and ignores an unswapped optional feature", () => {
    const out = grantedFeatures({ ...base, classes: [ranger], featuresById: byId(prim, natural) });
    expect(out.map((g) => g.feature.id)).toEqual(["prim"]);
  });

  it("a Ranger 3 with a swap shows the replacement at level 3 and not the original", () => {
    const classChoices = { feature_swaps: { primeval_awareness: "natural" } };
    const out = grantedFeatures({
      ...base,
      classChoices,
      classes: [klass({ className: "Ranger", levels: 3, classMap: { "3": ["prim"] } })],
      featuresById: byId(prim, natural),
    });
    expect(out.map((g) => g.feature.id)).toEqual(["natural"]);
    expect(out[0].grant).toMatchObject({ levelsGained: [3] });
    expect(featureIdsNeeded([ranger], classChoices)).toContain("natural");
  });
});

describe("featureIdsNeeded", () => {
  it("gathers class, subclass and feat ids once", () => {
    const ids = featureIdsNeeded([klass({ classMap: { "1": ["a"], "4": ["a"] }, subclassMap: { "3": ["b"] } })], { feats: ["c", "a"] });
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("resourcePools", () => {
  const grant = (features: ClassFeature[], classes: GrantedClassInput[], characterLevel: number) =>
    grantedFeatures({ ...base, characterLevel, classes, featuresById: byId(...features) });

  it("Fighter 17 has 2 Action Surge uses", () => {
    const g = grant([actionSurge], [klass({ className: "Fighter", levels: 17, classMap: { "2": ["surge"] } })], 17);
    expect(resourcePools(g, ctx({}, 17))[0]).toMatchObject({ key: "action_surge", max: 2 });
  });

  it("Cleric 6 / Paladin 3 share one Channel Divinity pool at the larger max", () => {
    const g = grant(
      [channelCleric, channelPaladin],
      [klass({ className: "Cleric", levels: 6, classMap: { "2": ["cd_cleric"] } }), klass({ className: "Paladin", levels: 3, classMap: { "3": ["cd_paladin"] } })],
      9,
    );
    const pools = resourcePools(g, ctx({}, 9));
    expect(pools).toHaveLength(1);
    expect(pools[0].max).toBe(2);
    expect(pools[0].sources).toEqual(["Channel Divinity", "Channel Divinity (Paladin)"]);
  });

  it("Bard 5 with Cha 16 has 3 Bardic Inspiration, back on a short rest", () => {
    const g = grant([bardic], [klass({ className: "Bard", levels: 5, classMap: { "1": ["bardic"] } })], 5);
    expect(resourcePools(g, ctx({ cha: 16 }))[0]).toMatchObject({ max: 3, recharge: "short" });
  });

  it("Bard 4 still recharges on a long rest", () => {
    const g = grant([bardic], [klass({ className: "Bard", levels: 4, classMap: { "1": ["bardic"] } })], 4);
    expect(resourcePools(g, ctx({ cha: 16 }, 4))[0].recharge).toBe("long");
  });

  it("Barbarian 20 Rage is unlimited and left out of class_resources", () => {
    const g = grant([rage], [klass({ className: "Barbarian", levels: 20, classMap: { "1": ["rage"] } })], 20);
    const pools = resourcePools(g, ctx({}, 20));
    expect(pools[0].max).toBe("unlimited");
    expect(classResourcesFor(pools, {})).toEqual({});
  });
});

describe("classResourcesFor", () => {
  const pools = [
    { key: "rage", label: "Rage", max: 3, recharge: "long" as const, shortRestRegain: 1, pool: false, sources: ["Rage"] },
    { key: "ki", label: "Ki", max: 5, recharge: "short" as const, shortRestRegain: null, pool: true, sources: ["Ki"] },
  ];

  it("starts a new key full, clamps current to a lowered max, and keeps a key no pool produces", () => {
    const next = classResourcesFor(pools, {
      rage: { current: 9, max: 9, rest: "long" },
      gone: { current: 1, max: 1, rest: "short" },
    });
    expect(next).toEqual({
      rage: { current: 3, max: 3, rest: "long", short_rest_regain: 1 },
      ki: { current: 5, max: 5, rest: "short" },
      gone: { current: 1, max: 1, rest: "short" },
    });
  });

  it("keeps spent uses", () => {
    expect(classResourcesFor(pools, { ki: { current: 2, max: 4, rest: "short" } }).ki.current).toBe(2);
  });

  it("classResourcesChanged compares deeply", () => {
    const a = classResourcesFor(pools, {});
    expect(classResourcesChanged(a, classResourcesFor(pools, a))).toBe(false);
    expect(classResourcesChanged(a, { ...a, ki: { ...a.ki, current: 1 } })).toBe(true);
    expect(classResourcesChanged(a, { rage: a.rage })).toBe(true);
  });
});

describe("actionsByActivation", () => {
  it("lists sub-actions in place of a feature that only groups them, and the toggle key", () => {
    const g = grantedFeatures({ ...base, classes: [klass({ classMap: { "1": ["cunning", "rage"] } })], featuresById: byId(cunning, rage) });
    const acts = actionsByActivation(g, 5);
    expect(acts.bonus_action.map((a) => a.name)).toEqual(["Dash", "Rage"]);
    expect(acts.bonus_action.find((a) => a.name === "Dash")?.isSubAction).toBe(true);
    expect(acts.bonus_action.find((a) => a.name === "Rage")?.toggleKey).toBe("rage");
    expect(acts.action[0]).toMatchObject({ name: "Stunning", spends: { key: "ki", amount: 1 } });
  });

  const thunder: FeatureEffect = {
    kind: "save",
    save: { ability: "con", dc_ability: "cha", success: "none" },
    dice: { "3": "1d6", "10": "2d6" },
    damage_type: "thunder",
  };

  it("lists a feature with an effect but no activation under special, carrying its effect and granting class", () => {
    const psychic = feature("psychic", "Psychic Blades", { effect: thunder });
    const g = grantedFeatures({ ...base, classes: [klass({ className: "Bard", levels: 12, classMap: { "1": ["psychic"] } })], featuresById: byId(psychic) });
    const acts = actionsByActivation(g, 12);
    expect(acts.special).toHaveLength(1);
    expect(acts.special[0]).toMatchObject({ name: "Psychic Blades", effect: thunder, effectLevel: 12, className: "Bard", isSubAction: false });
  });

  it("carries a sub-action's effect, and lists a grouping feature that also has its own effect", () => {
    const cannon = feature("cannon", "Eldritch Cannon", {
      effect: thunder,
      actions: [{ name: "Flamethrower", activation: "action", effect: { ...thunder, damage_type: "fire" } }],
    });
    const g = grantedFeatures({ ...base, classes: [klass({ className: "Artificer", levels: 5, classMap: { "1": ["cannon"] } })], featuresById: byId(cannon) });
    const acts = actionsByActivation(g, 5);
    expect(acts.special.map((a) => a.name)).toEqual(["Eldritch Cannon"]);
    const flame = acts.action.find((a) => a.name === "Flamethrower");
    expect(flame).toMatchObject({ isSubAction: true, className: "Artificer", effectLevel: 5 });
    expect(flame?.effect?.damage_type).toBe("fire");
  });

  it("spends a feature's own use when it is used, unless it names another cost; a sub-action costs only what it names", () => {
    const own = { key: "surge", label: "Action Surge", amount: { kind: "fixed", value: 1 }, recharge: "short", pool: false } as const;
    const surge = feature("surge", "Action Surge", { activation: "special", uses: own });
    const eye = feature("eye", "The Third Eye", {
      uses: { ...own, key: "third_eye", label: "The Third Eye" },
      actions: [{ name: "Darkvision", activation: "action" }, { name: "Free", activation: "action", spends: { key: "ki", amount: 2 } }],
    });
    const hands = feature("hands", "Lay on Hands", { activation: "action", uses: { ...own, key: "lay_on_hands", pool: true } });
    const g = grantedFeatures({ ...base, classes: [klass({ classMap: { "1": ["surge", "eye", "hands"] } })], featuresById: byId(surge, eye, hands) });
    const acts = actionsByActivation(g, 5);
    expect(acts.special.find((a) => a.name === "Action Surge")?.spends).toEqual({ key: "surge", amount: 1 });
    expect(acts.action.find((a) => a.name === "Darkvision")?.spends).toBeNull();
    expect(acts.action.find((a) => a.name === "Free")?.spends).toEqual({ key: "ki", amount: 2 });
    // A feature that groups sub-actions is still not listed of its own.
    expect(acts.action.some((a) => a.name === "The Third Eye")).toBe(false);
    // A pool is spent in chosen amounts: nothing is assumed.
    expect(acts.action.find((a) => a.name === "Lay on Hands")?.spends).toBeNull();
  });

  it("reads a feat's effect at the character's level, with no granting class", () => {
    const talent = feature("talent", "Fey Touched", { activation: "action", effect: thunder }, "feat");
    const g = grantedFeatures({ ...base, classes: [], featuresById: byId(talent), classChoices: { feats: ["talent"] }, characterLevel: 8 });
    expect(actionsByActivation(g, 8).action[0]).toMatchObject({ className: null, effectLevel: 8 });
  });
});

describe("riders and toggles", () => {
  const g = grantedFeatures({ ...base, classes: [klass({ className: "Barbarian", classMap: { "1": ["rage", "sneak"] } })], featuresById: byId(rage, sneak) });
  const melee = { kind: "weapon", melee: true, finesse: false, ranged: false, usesStrength: true } as const;
  const bow = { kind: "weapon", melee: false, finesse: false, ranged: true, usesStrength: false } as const;

  it("activeToggles reads <key>_active", () => {
    expect([...activeToggles({ rage_active: true, ki_active: false, other: true })]).toEqual(["rage"]);
  });

  it("offers Rage for a melee Strength weapon only while raging", () => {
    expect(damageRidersFor(g, melee, new Set()).map((r) => r.rider.label)).toEqual([]);
    expect(damageRidersFor(g, melee, new Set(["rage"])).map((r) => r.rider.label)).toEqual(["Rage"]);
  });

  it("does not offer Rage for a ranged weapon but does offer Sneak Attack at its scaling", () => {
    const offered = damageRidersFor(g, bow, new Set(["rage"]));
    expect(offered.map((r) => r.rider.label)).toEqual(["Sneak Attack"]);
    expect(offered[0].dice).toBe("3d6");
  });
});
