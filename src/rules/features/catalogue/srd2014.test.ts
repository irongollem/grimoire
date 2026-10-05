import { describe, expect, it } from "vitest";
import {
  parseFeatPrerequisites,
  parseMechanics,
} from "@/rules/features/mechanics";
import {
  choicePicksDue,
  costsOf,
  rechargeAt,
  scalingAt,
  usesMaxAt,
  type UsesContext,
} from "@/rules/features/resolve";
import { SRD_2014_FEATS, SRD_2014_FEATURES } from "./srd2014";

const ctx = (classLevel: number): UsesContext => ({
  classLevel,
  proficiencyBonus: 2,
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
});

function feature(key: string) {
  const entry = SRD_2014_FEATURES[key];
  if (!entry) throw new Error(`missing ${key}`);
  return entry;
}

describe("SRD 2014 feature catalogue", () => {
  it("has entries", () => {
    expect(Object.keys(SRD_2014_FEATURES).length).toBeGreaterThan(60);
  });

  it("every entry passes parseMechanics cleanly and round-trips", () => {
    for (const [key, mechanics] of Object.entries(SRD_2014_FEATURES)) {
      const parsed = parseMechanics(mechanics);
      expect(parsed.errors, key).toEqual([]);
      expect(parsed.mechanics, key).toEqual(mechanics);
    }
  });

  it("keys carry the Open5e srd_ prefix", () => {
    for (const key of [
      ...Object.keys(SRD_2014_FEATURES),
      ...Object.keys(SRD_2014_FEATS),
    ]) {
      expect(key, key).toMatch(/^srd_/);
    }
  });

  it("scales Sneak Attack", () => {
    const scaling = feature("srd_rogue_sneak-attack").scaling;
    expect(scaling && scalingAt(scaling, 5)).toBe("3d6");
    expect(scaling && scalingAt(scaling, 19)).toBe("10d6");
  });

  it("gives Rage unlimited uses at 20", () => {
    const uses = feature("srd_barbarian_rage").uses;
    expect(uses && usesMaxAt(uses, ctx(1))).toBe(2);
    expect(uses && usesMaxAt(uses, ctx(17))).toBe(6);
    expect(uses && usesMaxAt(uses, ctx(20))).toBe("unlimited");
  });

  it("makes Bardic Inspiration recharge on a short rest from 5", () => {
    const uses = feature("srd_bard_bardic-inspiration").uses;
    expect(uses && rechargeAt(uses, 4)).toBe("long");
    expect(uses && rechargeAt(uses, 5)).toBe("short");
  });

  it("owes one invocation going from 4 to 5", () => {
    const choice = feature("srd_warlock_eldritch-invocations").choices?.[0];
    expect(choice).toBeDefined();
    if (!choice) return;
    expect(
      choicePicksDue(choice, { levelsGranted: [2], fromLevel: 4, toLevel: 5 }),
    ).toBe(1);
    expect(
      choicePicksDue(choice, { levelsGranted: [2], fromLevel: 0, toLevel: 2 }),
    ).toBe(2);
  });

  it("pools Lay on Hands, Ki and Sorcery Points by class level", () => {
    const loh = feature("srd_paladin_lay-on-hands").uses;
    expect(loh && usesMaxAt(loh, ctx(4))).toBe(20);
    const ki = feature("srd_monk_ki").uses;
    expect(ki && usesMaxAt(ki, ctx(7))).toBe(7);
    const sp = feature("srd_sorcerer_font-of-magic").uses;
    expect(sp && usesMaxAt(sp, ctx(11))).toBe(11);
  });

  it("keeps the resource keys existing characters already store", () => {
    const keys: Record<string, string> = {
      srd_barbarian_rage: "rage_uses",
      "srd_cleric_channel-divinity": "channel_divinity",
      "srd_oath-of-devotion_channel-divinity": "channel_divinity",
      srd_monk_ki: "ki_points",
      "srd_fighter_second-wind": "second_wind",
      "srd_fighter_action-surge": "action_surge",
      "srd_wizard_arcane-recovery": "arcane_recovery",
      "srd_bard_bardic-inspiration": "bardic_inspiration",
      "srd_paladin_lay-on-hands": "lay_on_hands",
      "srd_sorcerer_font-of-magic": "sorcery_points",
      srd_fighter_indomitable: "indomitable",
    };
    for (const [record, key] of Object.entries(keys)) {
      expect(feature(record).uses?.key, record).toBe(key);
    }
    expect(feature("srd_druid_wild-shape").uses).toBeUndefined();
  });

  it("has unique resource keys per class, apart from the shared Channel Divinity", () => {
    const seen = new Map<string, string>();
    for (const [record, m] of Object.entries(SRD_2014_FEATURES)) {
      if (!m.uses || m.uses.key === "channel_divinity") continue;
      expect(
        seen.get(m.uses.key),
        `${m.uses.key} in ${record}`,
      ).toBeUndefined();
      seen.set(m.uses.key, record);
    }
  });
});

describe("SRD 2014 spends and added entries", () => {
  it("every spend names a pool some entry in the catalogue declares", () => {
    const pools = new Set(Object.values(SRD_2014_FEATURES).flatMap((m) => (m.uses ? [m.uses.key] : [])));
    for (const [record, m] of Object.entries(SRD_2014_FEATURES)) {
      for (const cost of costsOf(m)) expect(pools.has(cost.key), `${record} spends ${cost.key}`).toBe(true);
    }
  });

  it("prices the ki features", () => {
    expect(costsOf(feature("srd_monk_ki"))).toEqual([{ key: "ki_points", amount: 1 }]);
    expect(feature("srd_monk_stunning-strike").spends).toEqual({ key: "ki_points", amount: 1 });
    expect(feature("srd_monk_empty-body")).toMatchObject({ activation: "action", spends: { key: "ki_points", amount: 4 } });
  });

  it("spends Bardic Inspiration on Cutting Words and Peerless Skill", () => {
    expect(feature("srd_college-of-lore_cutting-words")).toMatchObject({ activation: "reaction", spends: { key: "bardic_inspiration", amount: 1 } });
    expect(feature("srd_college-of-lore_peerless-skill")).toMatchObject({ activation: "special", spends: { key: "bardic_inspiration", amount: 1 } });
  });

  it("spends Channel Divinity on every cleric and devotion option", () => {
    for (const record of ["srd_cleric_channel-divinity", "srd_life-domain_channel-divinity-preserve-life", "srd_oath-of-devotion_channel-divinity"]) {
      expect(feature(record).spends, record).toEqual({ key: "channel_divinity", amount: 1 });
    }
  });

  it("Divine Sense is 1 + Charisma modifier, minimum 1", () => {
    const uses = feature("srd_paladin_divine-sense").uses;
    expect(uses && usesMaxAt(uses, { ...ctx(1), abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 } })).toBe(4);
    expect(uses && usesMaxAt(uses, { ...ctx(1), abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 6 } })).toBe(1);
    expect(uses?.recharge).toBe("long");
  });

  it("offers Divine Smite's extra die against undead and fiends as its own rider", () => {
    const riders = feature("srd_paladin_divine-smite").riders ?? [];
    expect(riders.map((r) => r.label)).toEqual(["Divine Smite", "Divine Smite (undead or fiend)"]);
    expect(riders[1]).toMatchObject({ dice: { kind: "fixed", expression: "1d8" }, damage_type: "radiant", applies_to: "melee_weapon", once_per_turn: false });
    expect(riders[1].cost).toBeUndefined();
  });

  it("Hunter's Prey carries Colossus Slayer and both Hunter picks list the SRD options", () => {
    const prey = feature("srd_hunter_hunters-prey");
    expect(prey.riders?.[0]).toMatchObject({ label: "Colossus Slayer", applies_to: "weapon", once_per_turn: true });
    expect(prey.choices?.[0].pick).toEqual({ kind: "custom", options: ["Colossus Slayer", "Giant Killer", "Horde Breaker"] });
    expect(feature("srd_hunter_defensive-tactics").choices?.[0].pick).toEqual({
      kind: "custom",
      options: ["Escape the Horde", "Multiattack Defense", "Steel Will"],
    });
  });

  it("Fiendish Resilience picks one of the 13 damage types", () => {
    const choice = feature("srd_the-fiend_fiendish-resilience").choices?.[0];
    expect(choice?.count).toEqual({ kind: "per_grant", amount: 1 });
    expect(choice?.pick.kind === "custom" ? choice.pick.options : []).toHaveLength(13);
  });
});

describe("SRD 2014 feat catalogue", () => {
  it("encodes Grappler", () => {
    const grappler = SRD_2014_FEATS.srd_grappler;
    expect(grappler.category).toBeNull();
    expect(grappler.ability_increase).toBeNull();
    expect(parseFeatPrerequisites(grappler.prerequisites)).toEqual({
      abilities: { any_of: { str: 13 } },
    });
    expect(parseMechanics(grappler.mechanics).errors).toEqual([]);
  });
});
