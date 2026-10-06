import { describe, expect, it } from "vitest";
import { SRD_2024_FEATS, SRD_2024_FEATURES } from "./srd2024";
import { parseFeatAbilityIncrease, parseFeatPrerequisites, parseMechanics } from "@/rules/features/mechanics";
import { choicePicksDue, costsOf, restoredAfterRest, scalingAt, usesMaxAt } from "@/rules/features/resolve";
import type { FeatureMechanics } from "@/rules/features/mechanics.types";

const PREFIX = "srd-2024_";

function feature(key: string): FeatureMechanics {
  const entry = SRD_2024_FEATURES[`${PREFIX}${key}`];
  if (!entry) throw new Error(`missing ${key}`);
  return entry;
}

function usesKey(key: string): string {
  const uses = feature(key).uses;
  if (!uses) throw new Error(`${key} has no uses`);
  return uses.key;
}

const ctx = (classLevel: number) => ({
  classLevel,
  proficiencyBonus: 2,
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 },
});

describe("SRD 2024 catalogue", () => {
  it("keys are srd-2024 record keys", () => {
    for (const key of [...Object.keys(SRD_2024_FEATURES), ...Object.keys(SRD_2024_FEATS)]) {
      expect(key.startsWith(PREFIX)).toBe(true);
    }
  });

  it("every feature passes the mechanics validator with no errors", () => {
    for (const [key, mechanics] of Object.entries(SRD_2024_FEATURES)) {
      const parsed = parseMechanics(JSON.parse(JSON.stringify(mechanics)));
      expect({ key, errors: parsed.errors }).toEqual({ key, errors: [] });
      expect(parsed.mechanics).toEqual(mechanics);
    }
  });

  it("Magic Initiate asks for two cantrips and a free-cast first-level spell", () => {
    const picks = SRD_2024_FEATS["srd-2024_magic-initiate"].mechanics.choices?.map((c) => [c.pick, c.count]);
    expect(picks).toEqual([
      [{ kind: "spell", lists: ["Cleric", "Druid", "Wizard"], level: 0, free_cast: false }, { kind: "per_grant", amount: 2 }],
      [{ kind: "spell", lists: ["Cleric", "Druid", "Wizard"], level: 1, free_cast: true }, { kind: "per_grant", amount: 1 }],
    ]);
  });

  it("every feat passes its validators", () => {
    expect(Object.keys(SRD_2024_FEATS)).toHaveLength(17);
    for (const [key, feat] of Object.entries(SRD_2024_FEATS)) {
      const parsed = parseMechanics(JSON.parse(JSON.stringify(feat.mechanics)));
      expect({ key, errors: parsed.errors }).toEqual({ key, errors: [] });
      if (feat.prerequisites) expect(parseFeatPrerequisites(feat.prerequisites)).toEqual(feat.prerequisites);
      if (feat.ability_increase) expect(parseFeatAbilityIncrease(feat.ability_increase)).toEqual(feat.ability_increase);
      expect(feat.category).not.toBeNull();
    }
  });

  it("keeps the stored resource keys stable", () => {
    expect(usesKey("barbarian_rage")).toBe("rage_uses");
    expect(usesKey("cleric_channel-divinity")).toBe("channel_divinity");
    expect(usesKey("paladin_channel-divinity")).toBe("channel_divinity");
    expect(usesKey("monk_monks-focus")).toBe("ki_points");
    expect(usesKey("fighter_second-wind")).toBe("second_wind");
    expect(usesKey("fighter_action-surge")).toBe("action_surge");
    expect(usesKey("bard_bardic-inspiration")).toBe("bardic_inspiration");
    expect(usesKey("paladin_lay-on-hands")).toBe("lay_on_hands");
    expect(usesKey("sorcerer_font-of-magic")).toBe("sorcery_points");
    expect(usesKey("sorcerer_innate-sorcery")).toBe("innate_sorcery");
    expect(usesKey("wizard_arcane-recovery")).toBe("arcane_recovery");
    expect(usesKey("fighter_indomitable")).toBe("indomitable");
    expect(feature("druid_wild-shape").uses).toBeUndefined();
  });

  it("scales Sneak Attack and Rage as the class tables print them", () => {
    const sneak = feature("rogue_sneak-attack").scaling;
    if (!sneak) throw new Error("no scaling");
    expect(scalingAt(sneak, 5)).toBe("3d6");
    expect(scalingAt(sneak, 20)).toBe("10d6");
    const rage = feature("barbarian_rage");
    if (!rage.scaling || !rage.uses) throw new Error("rage incomplete");
    expect(scalingAt(rage.scaling, 9)).toBe("+3");
    expect(usesMaxAt(rage.uses, ctx(12))).toBe(5);
    expect(restoredAfterRest({ current: 1, max: 4, rest: rage.uses.recharge, short_rest_regain: rage.uses.short_rest_regain }, "short")).toBe(2);
  });

  it("owes the right picks at level-up", () => {
    const [mastery] = feature("fighter_weapon-mastery").choices ?? [];
    const [invocations] = feature("warlock_eldritch-invocations").choices ?? [];
    expect(choicePicksDue(mastery, { levelsGranted: [1], fromLevel: 3, toLevel: 4 })).toBe(1);
    expect(choicePicksDue(invocations, { levelsGranted: [1], fromLevel: 4, toLevel: 5 })).toBe(2);
  });

  it("monk and lay on hands pools scale with class level", () => {
    const focus = feature("monk_monks-focus").uses;
    const loh = feature("paladin_lay-on-hands").uses;
    if (!focus || !loh) throw new Error("missing uses");
    expect(usesMaxAt(focus, ctx(7))).toBe(7);
    expect(usesMaxAt(loh, ctx(4))).toBe(20);
  });

  it("every spend names a pool some entry in the catalogue declares", () => {
    const pools = new Set(Object.values(SRD_2024_FEATURES).flatMap((m) => (m.uses ? [m.uses.key] : [])));
    for (const [record, m] of Object.entries(SRD_2024_FEATURES)) {
      for (const cost of costsOf(m)) expect(pools.has(cost.key), `${record} spends ${cost.key}`).toBe(true);
    }
  });

  it("prices the Focus actions and Stunning Strike", () => {
    expect(costsOf(feature("monk_monks-focus"))).toEqual([{ key: "ki_points", amount: 1 }]);
    expect(feature("monk_stunning-strike")).toMatchObject({ activation: "special", spends: { key: "ki_points", amount: 1 } });
    const free = feature("monk_monks-focus").actions?.filter((a) => a.spends === undefined).map((a) => a.name);
    expect(free).toEqual(["Patient Defense", "Step of the Wind"]);
  });

  it("spends Bardic Inspiration and Channel Divinity where the SRD does", () => {
    expect(feature("college-of-lore_cutting-words")).toMatchObject({ activation: "reaction", spends: { key: "bardic_inspiration", amount: 1 } });
    expect(feature("college-of-lore_peerless-skill").spends).toEqual({ key: "bardic_inspiration", amount: 1 });
    for (const record of ["cleric_life-domain_preserve-life", "paladin_oath-of-devotion_sacred-weapon", "cleric_channel-divinity", "paladin_channel-divinity"]) {
      expect(feature(record).spends, record).toEqual({ key: "channel_divinity", amount: 1 });
    }
  });

  it("Hunter's Prey carries the Colossus Slayer rider", () => {
    expect(feature("ranger_hunter_hunters-prey").riders?.[0]).toMatchObject({
      label: "Colossus Slayer",
      dice: { kind: "fixed", expression: "1d8" },
      applies_to: "weapon",
      once_per_turn: true,
    });
  });

  it("Rage's toggle spends its own pool", () => {
    expect(feature("barbarian_rage").toggle?.spends).toEqual({ key: "rage_uses", amount: 1 });
  });
});
