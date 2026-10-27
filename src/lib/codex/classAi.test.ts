import { describe, expect, it } from "vitest";
import {
  classDraftFromAi,
  classWithFeatureIds,
  type ClassProgressionLike,
  featureCountsByBand,
  sanitizeKnownTable,
  slotGridFor,
  validateClassProgression,
  type ClassAiResult,
} from "./classAi";
import type { RulesetKey } from "@/types/ruleset.types";
import type { HitDie } from "@/levelup/customTypes";

function features(extra: { level: number; name: string }[] = []) {
  return [
    { level: 1, name: "Ember Sense", activation: "", description: "You sense warmth." },
    { level: 2, name: "Spark", activation: "bonus_action", description: "You spark." },
    { level: 3, name: "Cinder Path", activation: "", description: "Pick a path." },
    { level: 20, name: "Phoenix", activation: "action", description: "You rise again." },
    ...extra.map((e) => ({ ...e, activation: "", description: "text" })),
  ];
}

function ai(over: Partial<ClassAiResult> = {}): ClassAiResult {
  return {
    class_name: "Emberwarden",
    hit_die: 10,
    primary_ability: "Strength and Wisdom",
    saving_throws: ["str", "Constitution"],
    armor_proficiencies: ["Light armor", "Medium armor", "light armor"],
    weapon_proficiencies: ["Simple weapons"],
    subclass_level: 3,
    caster_progression: "half",
    features: features(),
    resources: [{ key: "Ember Charges", label: "Ember Charges", rest: "long", scaling: "fixed", fixed_value: 3 }],
    ...over,
  };
}

for (const ruleset of ["2014", "2024"] as RulesetKey[]) {
  describe(`classDraftFromAi (${ruleset})`, () => {
    const ctx = { ruleset, campaignId: "camp", asiFeatureId: "official-asi" };

    it("produces a progression with zero problems", () => {
      const draft = classDraftFromAi(ai(), ctx);
      expect(draft.problems).toEqual([]);
      expect(validateClassProgression(draft.base)).toEqual([]);
      expect(draft.base.saving_throws).toEqual(["Strength", "Constitution"]);
      expect(draft.warnings).toEqual([]);
      // The Ability Score Improvement is the shared official row, at the book's levels.
      const asi = draft.features.filter((f) => "existingId" in f);
      expect(asi.map((f) => f.level)).toEqual([4, 8, 12, 16, 19]);
      expect(asi.every((f) => "existingId" in f && f.existingId === "official-asi")).toBe(true);
      expect(draft.base.ruleset).toBe(ruleset);
      expect(draft.base.campaign_id).toBe("camp");
      expect(draft.base.armor_proficiencies).toEqual(["Light armor", "Medium armor"]);
      expect(draft.base.primary_ability).toBe("Strength and Wisdom");
    });

    it("computes 20x9 spell slots from the progression, not the model", () => {
      const draft = classDraftFromAi(ai({ spell_slots: [[99]] } as ClassAiResult), ctx);
      const grid = draft.base.spell_slots;
      expect(grid).toHaveLength(20);
      expect(grid?.every((r) => r.length === 9)).toBe(true);
      expect(grid?.[4]).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
      expect(draft.base.caster_type).toBe("prepared");
      expect(draft.base.prepared_ability).toBe("wis");
      expect(draft.base.prepared_divisor).toBe(2);
      expect(draft.base.slot_recovery).toBe("long");
    });

    it("gives a non-caster no slots and no caster fields", () => {
      const draft = classDraftFromAi(ai({ caster_progression: "none", spells_known: Array(20).fill(5) }), ctx);
      expect(draft.problems).toEqual([]);
      expect(draft.base).toMatchObject({
        spell_slots: null, spells_known: null, cantrips_known: null, caster_type: "none",
        prepared_ability: null, prepared_divisor: null, slot_recovery: "long",
      });
    });

    it("builds pact slots as a short-rest, single-tier table", () => {
      const draft = classDraftFromAi(ai({ caster_progression: "pact", prepared_ability: "cha" }), ctx);
      expect(draft.problems).toEqual([]);
      expect(draft.base.slot_recovery).toBe("short");
      expect(draft.base.spell_slots?.[0]).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(draft.base.spell_slots?.[19]).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0]);
    });

    it("keeps known-spell tables only for known casters and only when well-formed", () => {
      const table = Array.from({ length: 20 }, (_, i) => i + 1);
      const known = classDraftFromAi(ai({ caster_progression: "full", caster_type: "known", spells_known: table, cantrips_known: [2, ...Array(19).fill(4)] }), ctx);
      expect(known.base.spells_known).toEqual(table);
      expect(known.base.cantrips_known).toHaveLength(20);
      expect(known.base.prepared_ability).toBeNull();
      expect(known.base.prepared_divisor).toBeNull();
      const prepared = classDraftFromAi(ai({ caster_progression: "full", spells_known: table }), ctx);
      expect(prepared.base.spells_known).toBeNull();
      expect(prepared.problems).toEqual([]);
    });

    it("normalises hit die, resources and out-of-range features", () => {
      const draft = classDraftFromAi(
        ai({
          hit_die: 7,
          features: features([{ level: 0, name: "Bad" }, { level: 25, name: "Worse" }]),
          resources: [
            { key: "a", label: "A", scaling: "table", table_values: [1, 2] },
            { label: "Bolts", scaling: "table", table_values: Array(20).fill(2), rest: "short" },
          ],
        }),
        ctx,
      );
      expect(draft.base.hit_die).toBe(8);
      expect(draft.features.every((f) => f.level >= 1 && f.level <= 20)).toBe(true);
      // Only the valid resource survives, and it is a feature with uses rather than a class column.
      const bolts = draft.features.find((f) => "insert" in f && f.insert.name === "Bolts");
      expect(bolts && "insert" in bolts ? bolts.insert.mechanics?.uses : null).toMatchObject({
        key: "bolts",
        recharge: "short",
        amount: { kind: "by_level", values: { "1": 2 } },
      });
      expect(draft.features.some((f) => "insert" in f && f.insert.name === "A")).toBe(false);
      expect(draft.problems).toEqual([]);
    });

    it("drops a table resource with a non-numeric cell instead of zeroing it", () => {
      const cells: unknown[] = Array(20).fill(2);
      cells[7] = "lots";
      const draft = classDraftFromAi(
        ai({ resources: [{ label: "Bolts", scaling: "table", table_values: cells }] }),
        ctx,
      );
      expect(draft.features.some((f) => "insert" in f && f.insert.name === "Bolts")).toBe(false);
    });

    it("adds a real subclass-grant feature when the subclass level is bare", () => {
      const draft = classDraftFromAi(
        ai({ features: features().filter((f) => f.level !== 3) }),
        ctx,
      );
      expect(draft.problems).toEqual([]);
      expect(draft.base.features["3"]).toHaveLength(1);
      const grant = draft.features.find((f) => f.level === 3);
      expect(grant && "insert" in grant ? grant.insert.description : null).toContain("subclass");
    });

    it("reports what it cannot repair", () => {
      const noLevelOne = classDraftFromAi(ai({ features: features().filter((f) => f.level !== 1), resources: [] }), ctx);
      expect(noLevelOne.problems.join(" ")).toContain("level 1");
      const oneSave = classDraftFromAi(ai({ saving_throws: ["str"] }), ctx);
      expect(oneSave.problems.join(" ")).toContain("saving throw");
      const noName = classDraftFromAi(ai({ class_name: " " }), ctx);
      expect(noName.problems[0]).toContain("no name");
    });

    it("treats a hostile payload as a problem list, not a crash", () => {
      const draft = classDraftFromAi({ features: "x", saving_throws: 5, hit_die: {}, resources: 3 } as ClassAiResult, ctx);
      expect(draft.problems.length).toBeGreaterThan(0);
    });

    it("links created feature ids by level", () => {
      const draft = classDraftFromAi(ai(), ctx);
      const ids = draft.features.map((_, i) => `id${i}`);
      const row = classWithFeatureIds(draft, ids);
      expect(row.features["1"]).toEqual(["id0", "id1"]);
      expect(Object.values(row.features).flat()).toEqual(ids);
      expect(validateClassProgression(row)).toEqual([]);
    });
  });
}

describe("edition shaping", () => {
  it("fixes the 2024 subclass level at 3 and clamps the 2014 one to 1-3", () => {
    const f = features();
    expect(classDraftFromAi(ai({ subclass_level: 1, features: f }), { ruleset: "2024", campaignId: null }).base.subclass_level).toBe(3);
    expect(classDraftFromAi(ai({ subclass_level: 1 }), { ruleset: "2014", campaignId: null }).base.subclass_level).toBe(1);
    expect(classDraftFromAi(ai({ subclass_level: 9 }), { ruleset: "2014", campaignId: null }).base.subclass_level).toBe(3);
  });

  it.each([[0, 3], [1, 1], [3, 3], [4, 3]])("reads a 2014 subclass level of %i as %i", (asked, got) => {
    expect(classDraftFromAi(ai({ subclass_level: asked }), { ruleset: "2014", campaignId: null }).base.subclass_level).toBe(got);
  });

  it("names the subclass-grant feature for the edition", () => {
    const grantName = (ruleset: RulesetKey) => {
      const draft = classDraftFromAi(ai({ features: features().filter((f) => f.level !== 3) }), { ruleset, campaignId: null });
      const grant = draft.features.find((f) => f.level === 3);
      return grant && "insert" in grant ? grant.insert.name : null;
    };
    expect(grantName("2024")).toBe("Emberwarden Subclass");
    expect(grantName("2014")).toBe("Subclass Choice");
  });

  it("has a pact caster known in 2014 and prepared in 2024 unless the model says otherwise", () => {
    const type = (ruleset: RulesetKey) => classDraftFromAi(ai({ caster_progression: "pact" }), { ruleset, campaignId: null }).base.caster_type;
    expect(type("2014")).toBe("known");
    expect(type("2024")).toBe("prepared");
  });

  it("falls back to Charisma to prepare spells when no primary ability maps to a casting ability", () => {
    const draft = classDraftFromAi(ai({ primary_ability: "Strength", caster_progression: "full" }), { ruleset: "2024", campaignId: null });
    expect(draft.base.prepared_ability).toBe("cha");
  });

  it("gives full casters their ninth-level slots at level 17", () => {
    expect(slotGridFor("full", "2024")?.[16]).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 1]);
  });

  it("keeps two primary abilities and two saving throws of the ones given", () => {
    const draft = classDraftFromAi(
      ai({ primary_ability: "Strength, Dexterity and Wisdom", saving_throws: ["str", "dex", "wis"] }),
      { ruleset: "2024", campaignId: null },
    );
    expect(draft.base.primary_ability).toBe("Strength and Dexterity");
    expect(draft.base.saving_throws).toEqual(["Strength", "Dexterity"]);
  });

  it("caps feature counts, proficiencies and the known tables", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ level: 5, name: `F${n}`, description: "d" }));
    const draft = classDraftFromAi(ai({ features: [...features(), ...five] }), { ruleset: "2024", campaignId: null });
    expect(draft.base.features["5"]).toHaveLength(4);
    const manyArmor = Array.from({ length: 14 }, (_, i) => `Armor ${i}`);
    expect(classDraftFromAi(ai({ armor_proficiencies: manyArmor }), { ruleset: "2024", campaignId: null }).base.armor_proficiencies).toHaveLength(12);
    const spells = classDraftFromAi(
      ai({ caster_progression: "full", caster_type: "known", spells_known: Array(20).fill(99), cantrips_known: Array(20).fill(99) }),
      { ruleset: "2024", campaignId: null },
    );
    expect(spells.base.spells_known?.[19]).toBe(30);
    expect(spells.base.cantrips_known?.[19]).toBe(6);
  });

  it("keeps at most 60 written features", () => {
    const lots = Array.from({ length: 70 }, (_, i) => ({ level: (i % 20) + 1, name: `F${i}`, description: "d" }));
    const draft = classDraftFromAi(ai({ features: lots, resources: [] }), { ruleset: "2024", campaignId: null });
    expect(draft.features.filter((f) => "insert" in f)).toHaveLength(60);
  });

  it("adds no subclass-grant feature to a class that has no name", () => {
    const draft = classDraftFromAi(ai({ class_name: "", features: features().filter((f) => f.level !== 3) }), { ruleset: "2024", campaignId: null });
    expect(draft.features.some((f) => f.level === 3)).toBe(false);
  });

  it("gives 2024 half casters their level 1 slots, as the Paladin and Ranger have", () => {
    expect(slotGridFor("half", "2024")?.[0][0]).toBe(2);
    expect(slotGridFor("half", "2014")?.[0][0]).toBe(0);
  });
});

describe("validateClassProgression", () => {
  const valid = classDraftFromAi(ai(), { ruleset: "2024", campaignId: null }).base;
  const grid = (rows: number, cols: number) => Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  it("accepts the generated class", () => {
    expect(validateClassProgression(valid)).toEqual([]);
  });

  it.each<[string, Partial<ClassProgressionLike>, RegExp]>([
    ["a hit die that is not a d6/d8/d10/d12", { hit_die: 9 as HitDie }, /Hit die 9/],
    ["one saving throw", { saving_throws: ["Strength"] }, /exactly two/],
    ["three saving throws", { saving_throws: ["Strength", "Dexterity", "Wisdom"] }, /exactly two/],
    ["the same saving throw twice", { saving_throws: ["Strength", "Strength"] }, /exactly two/],
    ["a saving throw that is not an ability", { saving_throws: ["Strength", "Luck"] }, /exactly two/],
    ["a subclass level of 0", { subclass_level: 0 }, /subclass level must be between/],
    ["a subclass level of 21", { subclass_level: 21 }, /subclass level must be between/],
    ["a spell slot table of 19 levels", { spell_slots: grid(19, 9) }, /20 levels of 9/],
    ["a spell slot row of 8 columns", { spell_slots: grid(20, 8) }, /20 levels of 9/],
    ["slots on a class marked as a non-caster", { caster_type: "none" }, /disagree/],
    ["spells known of 2 levels", { spells_known: [1, 2] }, /Spells known/],
    ["cantrips known of 2 levels", { cantrips_known: [1, 2] }, /Cantrips known/],
    ["a negative cantrip cell", { cantrips_known: [-1, ...Array<number>(19).fill(1)] }, /Cantrips known/],
    ["a level 21 feature", { features: { ...valid.features, "21": ["x"] } }, /level "21"/],
    ["a level 0 feature", { features: { ...valid.features, "0": ["x"] } }, /level "0"/],
    ["no feature at level 1", { features: { ...valid.features, "1": [] } }, /no level 1 feature/],
    ["nothing at the subclass level", { features: { ...valid.features, "3": [] } }, /nothing at its subclass level \(3\)/],
  ])("flags %s", (_what, over, message) => {
    const problems = validateClassProgression({ ...valid, ...over });
    expect(problems.filter((p) => message.test(p))).toHaveLength(1);
  });

  it("allows a subclass level of 1 and of 20 when the class grants something there", () => {
    const at = (level: number) => ({ ...valid, subclass_level: level, features: { ...valid.features, [String(level)]: ["x"] } });
    expect(validateClassProgression(at(1))).toEqual([]);
    expect(validateClassProgression(at(20))).toEqual([]);
  });
});

describe("helpers", () => {
  it("sanitizeKnownTable enforces length, non-negative and non-decreasing", () => {
    expect(sanitizeKnownTable([1, 2], 6)).toBeNull();
    expect(sanitizeKnownTable(Array(20).fill(0), 6)).toBeNull();
    expect(sanitizeKnownTable(Array(20).fill(-1), 6)).toBeNull();
    expect(sanitizeKnownTable([-1, ...Array(19).fill(5)], 6)).toBeNull();
    expect(sanitizeKnownTable(Array(21).fill(1), 6)).toBeNull();
    const t = sanitizeKnownTable([3, 2, ...Array(18).fill(9)], 6);
    expect(t?.slice(0, 3)).toEqual([3, 3, 6]);
  });

  it("warns, without blocking, when the official ASI feature is missing", () => {
    const draft = classDraftFromAi(ai(), { ruleset: "2024", campaignId: null });
    expect(draft.problems).toEqual([]);
    expect(draft.warnings.join(" ")).toContain("Ability Score Improvement");
    expect(draft.features.some((f) => "existingId" in f)).toBe(false);
  });

  it("featureCountsByBand counts by level range", () => {
    const draft = classDraftFromAi(ai(), { ruleset: "2024", campaignId: null });
    const counts = featureCountsByBand(draft.features);
    expect(counts.map((c) => c.count)).toEqual([4, 0, 0, 1]);
  });
});
