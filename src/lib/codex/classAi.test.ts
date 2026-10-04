import { describe, expect, it } from "vitest";
import {
  classDraftFromAi,
  classWithFeatureIds,
  featureCountsByBand,
  sanitizeKnownTable,
  sanitizeResources,
  slotGridFor,
  validateClassProgression,
  type ClassAiResult,
} from "./classAi";
import type { RulesetKey } from "@/types/ruleset.types";

function features(extra: { level: number; name: string }[] = []) {
  return [
    { level: 1, name: "Ember Sense", feature_type: "passive", description: "You sense warmth." },
    { level: 2, name: "Spark", feature_type: "bonus_action", description: "You spark." },
    { level: 3, name: "Cinder Path", feature_type: "passive", description: "Pick a path." },
    { level: 20, name: "Phoenix", feature_type: "active", description: "You rise again." },
    ...extra.map((e) => ({ ...e, feature_type: "passive", description: "text" })),
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
    const ctx = { ruleset, campaignId: "camp" };

    it("produces a progression with zero problems", () => {
      const draft = classDraftFromAi(ai(), ctx);
      expect(draft.problems).toEqual([]);
      expect(validateClassProgression(draft.base)).toEqual([]);
      expect(draft.base.saving_throws).toEqual(["Strength", "Constitution"]);
      expect(draft.base.asi_levels).toEqual([4, 8, 12, 16, 19]);
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
      expect(draft.base.resources).toHaveLength(1);
      expect(draft.base.resources[0]).toMatchObject({ key: "bolts", rest: "short", scaling: "table" });
      expect(draft.problems).toEqual([]);
    });

    it("drops a table resource with a non-numeric cell instead of zeroing it", () => {
      const cells: unknown[] = Array(20).fill(2);
      cells[7] = "lots";
      const draft = classDraftFromAi(
        ai({ resources: [{ label: "Bolts", scaling: "table", table_values: cells }] }),
        ctx,
      );
      expect(draft.base.resources).toHaveLength(0);
    });

    it("adds a real subclass-grant feature when the subclass level is bare", () => {
      const draft = classDraftFromAi(
        ai({ features: features().filter((f) => f.level !== 3) }),
        ctx,
      );
      expect(draft.problems).toEqual([]);
      expect(draft.base.features["3"]).toHaveLength(1);
      expect(draft.features.find((f) => f.level === 3)?.insert.description).toContain("subclass");
    });

    it("reports what it cannot repair", () => {
      const noLevelOne = classDraftFromAi(ai({ features: features().filter((f) => f.level !== 1) }), ctx);
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
      expect(row.features["1"]).toEqual(["id0"]);
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

  it("gives 2024 half casters their level 1 slots, as the Paladin and Ranger have", () => {
    expect(slotGridFor("half", "2024")?.[0][0]).toBe(2);
    expect(slotGridFor("half", "2014")?.[0][0]).toBe(0);
  });
});

describe("validateClassProgression", () => {
  const valid = classDraftFromAi(ai(), { ruleset: "2024", campaignId: null }).base;
  it("flags each structural fault", () => {
    expect(validateClassProgression({ ...valid, hit_die: 9 as never }).length).toBeGreaterThan(0);
    expect(validateClassProgression({ ...valid, asi_levels: [8, 4] }).length).toBeGreaterThan(0);
    expect(validateClassProgression({ ...valid, spell_slots: [[1]] }).length).toBeGreaterThan(0);
    expect(validateClassProgression({ ...valid, caster_type: "none" }).length).toBeGreaterThan(0);
    expect(validateClassProgression({ ...valid, cantrips_known: [1, 2] }).length).toBeGreaterThan(0);
    expect(validateClassProgression({ ...valid, features: { ...valid.features, "21": ["x"] } }).length).toBeGreaterThan(0);
    expect(validateClassProgression({ ...valid, resources: [{ key: "t", label: "T", rest: "long", scaling: "table" }] }).length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("sanitizeKnownTable enforces length, non-negative and non-decreasing", () => {
    expect(sanitizeKnownTable([1, 2], 6)).toBeNull();
    expect(sanitizeKnownTable(Array(20).fill(0), 6)).toBeNull();
    expect(sanitizeKnownTable(Array(20).fill(-1), 6)).toBeNull();
    const t = sanitizeKnownTable([3, 2, ...Array(18).fill(9)], 6);
    expect(t?.slice(0, 3)).toEqual([3, 3, 6]);
  });

  it("sanitizeResources dedupes keys and caps the count", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `R${i}`, scaling: "per_level" }));
    expect(sanitizeResources(many)).toHaveLength(6);
    expect(sanitizeResources([{ label: "X" }, { label: "x" }])).toHaveLength(1);
  });

  it("featureCountsByBand counts by level range", () => {
    const draft = classDraftFromAi(ai(), { ruleset: "2024", campaignId: null });
    const counts = featureCountsByBand(draft.features);
    expect(counts.map((c) => c.count)).toEqual([3, 0, 0, 1]);
  });
});
