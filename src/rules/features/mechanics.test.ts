import { describe, expect, it } from "vitest";
import { parseFeatAbilityIncrease, parseFeatPrerequisites, parseMechanics } from "./mechanics";
import type { FeatureMechanics } from "./mechanics.types";

const rage: FeatureMechanics = {
  activation: "bonus_action",
  uses: {
    key: "rage",
    label: "Rage",
    recharge: "long",
    short_rest_regain: 1,
    pool: false,
    amount: { kind: "unlimited_from", level: 20, below: { kind: "by_level", values: { "1": 2, "3": 3 } } },
  },
  scaling: { label: "Rage Damage", values: { "1": "+2", "9": "+3" } },
  toggle: { key: "raging", label: "Raging", spends: { key: "rage_uses", amount: 1 }, ends_on: "long_rest" },
  riders: [
    {
      label: "Rage",
      dice: { kind: "scaling" },
      applies_to: "melee_strength",
      once_per_turn: false,
      requires_toggle: "raging",
    },
  ],
  spends: { key: "bardic_inspiration", amount: 1 },
  actions: [{ name: "Dash", activation: "bonus_action", spends: { key: "ki_points", amount: 2 } }],
  choices: [
    {
      key: "invocations",
      label: "Invocations",
      pick: { kind: "option", set: "eldritch_invocation" },
      count: { kind: "known", values: { "2": 2, "5": 3 } },
      replace_on_level_up: true,
    },
    {
      key: "expertise",
      label: "Expertise",
      pick: { kind: "expertise", thieves_tools: true },
      count: { kind: "per_grant", amount: 2 },
      replace_on_level_up: false,
    },
  ],
  replaces: "fighting_style",
};

describe("parseMechanics", () => {
  it("empty, null and undefined give empty mechanics", () => {
    expect(parseMechanics({})).toEqual({ mechanics: {}, errors: [] });
    expect(parseMechanics(null)).toEqual({ mechanics: {}, errors: [] });
    expect(parseMechanics(undefined)).toEqual({ mechanics: {}, errors: [] });
  });
  it("junk never throws", () => {
    expect(parseMechanics("x").errors).toHaveLength(1);
    expect(parseMechanics([]).errors).toHaveLength(1);
    expect(parseMechanics({ uses: 5, riders: "x", choices: 3, actions: {}, toggle: [] }).mechanics).toEqual({});
  });
  it("round-trips a full valid feature unchanged", () => {
    const parsed = parseMechanics(JSON.parse(JSON.stringify(rage)));
    expect(parsed.errors).toEqual([]);
    expect(parsed.mechanics).toEqual(rage);
  });
  it("2024 rage regain, Bardic recharge_from and Lay on Hands pool validate", () => {
    const { mechanics, errors } = parseMechanics({
      uses: {
        key: "bardic_inspiration",
        label: "Bardic Inspiration",
        recharge: "long",
        recharge_from: { level: 5, recharge: "short" },
        pool: false,
        amount: { kind: "ability_mod", ability: "cha", min: 1 },
      },
    });
    expect(errors).toEqual([]);
    expect(mechanics.uses?.recharge_from).toEqual({ level: 5, recharge: "short" });
    expect(parseMechanics({ uses: { key: "lay_on_hands", label: "LoH", recharge: "long", pool: true, amount: { kind: "class_level", multiplier: 5 } } }).errors).toEqual([]);
  });
  it("drops an unknown amount kind with a path", () => {
    const { mechanics, errors } = parseMechanics({
      uses: { key: "a", label: "A", recharge: "long", pool: false, amount: { kind: "foo" } },
    });
    expect(mechanics.uses).toBeUndefined();
    expect(errors).toContain("uses.amount: unknown kind 'foo'");
  });
  it("keeps valid parts when another is invalid", () => {
    const { mechanics, errors } = parseMechanics({ activation: "action", scaling: { label: "", values: {} } });
    expect(mechanics).toEqual({ activation: "action" });
    expect(errors.length).toBeGreaterThan(0);
  });
  it("rejects unknown enum members", () => {
    expect(parseMechanics({ activation: "swift" }).errors[0]).toMatch(/activation/);
    const uses = { key: "a", label: "A", recharge: "weekly", pool: false, amount: { kind: "fixed", value: 1 } };
    expect(parseMechanics({ uses }).errors[0]).toMatch(/recharge/);
    const rider = { label: "x", dice: { kind: "scaling" }, applies_to: "tail", once_per_turn: false };
    expect(parseMechanics({ riders: [rider] }).errors[0]).toMatch(/applies_to/);
    const choice = { key: "a", label: "A", replace_on_level_up: false, count: { kind: "per_grant", amount: 1 }, pick: { kind: "option", set: "nope" } };
    expect(parseMechanics({ choices: [choice] }).errors[0]).toMatch(/option set/);
  });
  it("by-level keys must be integer levels 1-20", () => {
    const bad = parseMechanics({ scaling: { label: "S", values: { "0": "a", "21": "b", "03": "c", x: "d", "2": "ok" } } });
    expect(bad.mechanics.scaling?.values).toEqual({ "2": "ok" });
    expect(bad.errors).toHaveLength(4);
  });
  it("by-level values must have the right type", () => {
    const { mechanics, errors } = parseMechanics({
      uses: { key: "a", label: "A", recharge: "long", pool: false, amount: { kind: "by_level", values: { "1": -1, "2": 1.5, "3": 2 } } },
    });
    expect(mechanics.uses?.amount).toEqual({ kind: "by_level", values: { "3": 2 } });
    expect(errors).toHaveLength(2);
  });
  it("keys must match the pattern", () => {
    const uses = { key: "Rage!", label: "A", recharge: "long", pool: false, amount: { kind: "fixed", value: 1 } };
    expect(parseMechanics({ uses }).mechanics.uses).toBeUndefined();
    expect(parseMechanics({ toggle: { key: "1a", label: "T", ends_on: "long_rest" } }).mechanics.toggle).toBeUndefined();
  });
  it("dice expressions must parse", () => {
    const fixed = (expression: string) => ({
      riders: [{ label: "x", dice: { kind: "fixed", expression }, applies_to: "weapon", once_per_turn: false }],
    });
    expect(parseMechanics(fixed("1d6+2")).errors).toEqual([]);
    expect(parseMechanics(fixed("banana")).mechanics.riders).toBeUndefined();
    const slot = { kind: "slot", base: "2d8", base_level: 1, per_level: "nope", max_dice: 5 };
    expect(parseMechanics({ riders: [{ label: "x", dice: slot, applies_to: "weapon", once_per_turn: false }] }).errors[0]).toMatch(/per_level/);
  });
  it("2014 Divine Smite slot rider validates", () => {
    const slot = { kind: "slot", base: "2d8", base_level: 1, per_level: "1d8", max_dice: 5 };
    const r = parseMechanics({ riders: [{ label: "Divine Smite", dice: slot, applies_to: "melee_weapon", once_per_turn: false, cost: { kind: "spell_slot" } }] });
    expect(r.errors).toEqual([]);
    expect(r.mechanics.riders).toHaveLength(1);
  });
  it("requires_toggle must name the feature's own toggle", () => {
    const rider = { label: "Rage", dice: { kind: "scaling" }, applies_to: "melee_strength", once_per_turn: false, requires_toggle: "other" };
    expect(parseMechanics({ riders: [rider] }).mechanics.riders).toBeUndefined();
    expect(parseMechanics({ toggle: { key: "raging", label: "R", ends_on: "short_rest" }, riders: [rider] }).errors).toHaveLength(1);
    expect(parseMechanics({ riders: [{ ...rider, requires_toggle: "raging" }] }).mechanics.riders).toBeUndefined();
  });
  it("per_grant amount must be at least 1", () => {
    const choice = (amount: number) => ({
      choices: [{ key: "a", label: "A", replace_on_level_up: false, pick: { kind: "asi_or_feat" }, count: { kind: "per_grant", amount } }],
    });
    expect(parseMechanics(choice(1)).errors).toEqual([]);
    expect(parseMechanics(choice(0)).mechanics.choices).toBeUndefined();
  });
  it("a custom pick needs a non-empty option", () => {
    const choice = (options: unknown) => ({
      choices: [{ key: "a", label: "A", replace_on_level_up: false, count: { kind: "per_grant", amount: 1 }, pick: { kind: "custom", options } }],
    });
    expect(parseMechanics(choice(["Wing"])).errors).toEqual([]);
    expect(parseMechanics(choice([])).mechanics.choices).toBeUndefined();
    expect(parseMechanics(choice(["", "  "])).mechanics.choices).toBeUndefined();
    expect(parseMechanics(choice(["", "Wing"])).mechanics.choices?.[0].pick).toEqual({ kind: "custom", options: ["Wing"] });
  });
  it("unlimited_from.below cannot itself be unlimited_from", () => {
    const inner = { kind: "unlimited_from", level: 10, below: { kind: "fixed", value: 1 } };
    const uses = { key: "a", label: "A", recharge: "long", pool: false, amount: { kind: "unlimited_from", level: 20, below: inner } };
    const r = parseMechanics({ uses });
    expect(r.mechanics.uses).toBeUndefined();
    expect(r.errors[0]).toMatch(/uses\.amount\.below/);
  });
  it("feat pick categories are checked", () => {
    const choice = { key: "a", label: "A", replace_on_level_up: false, count: { kind: "per_grant", amount: 1 }, pick: { kind: "feat", categories: ["origin", "bogus"] } };
    const r = parseMechanics({ choices: [choice] });
    expect(r.mechanics.choices?.[0].pick).toEqual({ kind: "feat", categories: ["origin"] });
    expect(r.errors).toHaveLength(1);
  });
});

describe("parseMechanics uses costs", () => {
  const bad = [
    { key: "Ki", amount: 1 },
    { key: "ki", amount: 0 },
    { key: "ki", amount: 1.5 },
    { key: "ki" },
    "ki",
  ];
  it("a feature's own spend must be a keyed whole amount of at least 1", () => {
    expect(parseMechanics({ spends: { key: "ki_points", amount: 4 } })).toEqual({
      mechanics: { spends: { key: "ki_points", amount: 4 } },
      errors: [],
    });
    for (const spends of bad) {
      const r = parseMechanics({ spends });
      expect(r.mechanics.spends).toBeUndefined();
      expect(r.errors[0]).toMatch(/^spends/);
    }
  });
  it("sub-action and toggle spends are checked with their path", () => {
    const actions = parseMechanics({ actions: [{ name: "Dash", activation: "action", spends: { key: "x y", amount: 1 } }] });
    expect(actions.mechanics.actions).toEqual([{ name: "Dash", activation: "action" }]);
    expect(actions.errors[0]).toMatch(/^actions\[0\]\.spends\.key/);
    const toggle = parseMechanics({ toggle: { key: "r", label: "R", ends_on: "short_rest", spends: { key: "rage", amount: 0 } } });
    expect(toggle.mechanics.toggle).toEqual({ key: "r", label: "R", ends_on: "short_rest" });
    expect(toggle.errors[0]).toMatch(/^toggle\.spends\.amount/);
  });
  it("the retired costs_uses field is ignored, not carried", () => {
    const r = parseMechanics({ actions: [{ name: "A", activation: "action", costs_uses: 1 }], toggle: { key: "t", label: "T", ends_on: "short_rest", costs_uses: 1 } });
    expect(r.mechanics.actions).toEqual([{ name: "A", activation: "action" }]);
    expect(r.mechanics.toggle).toEqual({ key: "t", label: "T", ends_on: "short_rest" });
  });
  it("a rider's uses cost carries its pool key", () => {
    const rider = (cost: unknown) => ({ riders: [{ label: "x", dice: { kind: "fixed", expression: "1d6" }, applies_to: "weapon", once_per_turn: false, cost }] });
    const ok = parseMechanics(rider({ kind: "uses", key: "ki_points", amount: 1 }));
    expect(ok.errors).toEqual([]);
    expect(ok.mechanics.riders?.[0].cost).toEqual({ kind: "uses", key: "ki_points", amount: 1 });
    const noKey = parseMechanics(rider({ kind: "uses", amount: 1 }));
    expect(noKey.mechanics.riders?.[0].cost).toBeUndefined();
    expect(noKey.errors[0]).toMatch(/riders\[0\]\.cost\.key/);
    expect(parseMechanics(rider({ kind: "uses", key: "ki", amount: 0 })).mechanics.riders?.[0].cost).toBeUndefined();
  });
});

describe("parseMechanics ability_mod bonus", () => {
  const amount = (bonus: unknown) => ({
    uses: { key: "a", label: "A", recharge: "long", pool: false, amount: { kind: "ability_mod", ability: "cha", min: 1, bonus } },
  });
  it("accepts a positive or negative whole bonus and omits it when absent", () => {
    expect(parseMechanics(amount(1)).mechanics.uses?.amount).toEqual({ kind: "ability_mod", ability: "cha", min: 1, bonus: 1 });
    expect(parseMechanics(amount(-1)).mechanics.uses?.amount).toEqual({ kind: "ability_mod", ability: "cha", min: 1, bonus: -1 });
    expect(parseMechanics(amount(undefined)).mechanics.uses?.amount).toEqual({ kind: "ability_mod", ability: "cha", min: 1 });
  });
  it("rejects a fractional or non-numeric bonus and drops the uses", () => {
    for (const bonus of [1.5, "1", null]) {
      const r = parseMechanics(amount(bonus));
      expect(r.mechanics.uses).toBeUndefined();
      expect(r.errors[0]).toMatch(/uses\.amount\.bonus/);
    }
  });
});

describe("parseFeatPrerequisites", () => {
  it("is null for absent, empty or junk", () => {
    expect(parseFeatPrerequisites(null)).toBeNull();
    expect(parseFeatPrerequisites({})).toBeNull();
    expect(parseFeatPrerequisites("x")).toBeNull();
    expect(parseFeatPrerequisites({ level: 99, armor: "plate" })).toBeNull();
  });
  it("keeps valid parts", () => {
    expect(
      parseFeatPrerequisites({ level: 4, abilities: { any_of: { str: 13, dex: 13, foo: 9 } }, spellcasting: true, armor: "medium", fighting_style_feature: true }),
    ).toEqual({ level: 4, abilities: { any_of: { str: 13, dex: 13 } }, spellcasting: true, armor: "medium", fighting_style_feature: true });
  });
});

describe("parseFeatAbilityIncrease", () => {
  it("accepts the ASI and a single-ability feat", () => {
    const asi = { abilities: ["str", "dex", "con", "int", "wis", "cha"], amount: 2, split: true, max: 20 };
    expect(parseFeatAbilityIncrease(asi)).toEqual(asi);
    const single = { abilities: ["str", "dex"], amount: 1, split: false, max: 20 };
    expect(parseFeatAbilityIncrease(single)).toEqual(single);
  });
  it("is null when absent or invalid", () => {
    expect(parseFeatAbilityIncrease(null)).toBeNull();
    expect(parseFeatAbilityIncrease({})).toBeNull();
    expect(parseFeatAbilityIncrease({ abilities: ["xx"], amount: 1, split: false, max: 20 })).toBeNull();
    expect(parseFeatAbilityIncrease({ abilities: ["str"], amount: 0, split: false, max: 20 })).toBeNull();
    expect(parseFeatAbilityIncrease({ abilities: ["str"], amount: 2, split: true, max: 20 })).toBeNull();
    expect(parseFeatAbilityIncrease({ abilities: ["str"], amount: 1, split: false, max: 99 })).toBeNull();
  });
});
