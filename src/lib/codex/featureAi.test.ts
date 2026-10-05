import { describe, expect, it } from "vitest";
import { activationFrom, featureIdsByLevel, featureInsertFromAi, levelledFeaturesFromAi, mechanicsFromAi } from "./featureAi";
import { createWithFeatures } from "./featureBatch";
import type { ClassFeatureInsert } from "@/types/feature.types";

const ctx = { ruleset: "2024", campaignId: "camp-1" } as const;

describe("featureInsertFromAi", () => {
  it("builds a row with provenance, ruleset and campaign scope", () => {
    const prov = { edited: false } as never;
    const row = featureInsertFromAi(
      { name: " Ember Step ", description: "Move 10 feet.\n\nNo opportunity attacks.", activation: "Bonus Action", tags: ["Fire", "fire", "Move"], ai_provenance: prov },
      ctx,
    );
    expect(row).toMatchObject({
      name: "Ember Step",
      kind: "feature",
      mechanics: { activation: "bonus_action" },
      ruleset: "2024",
      campaign_id: "camp-1",
      source: "Grimoire:AI",
      open5e_import: false,
      tags: ["fire", "move"],
      ai_provenance: prov,
    });
    expect(row?.description).toContain("Move 10 feet");
  });

  it("rejects rows with no name or no rules text", () => {
    expect(featureInsertFromAi({ name: "", description: "x" }, ctx)).toBeNull();
    expect(featureInsertFromAi({ name: "x", description: "  " }, ctx)).toBeNull();
  });

  it("reads an unknown activation as passive", () => {
    expect(activationFrom("mythic")).toBeNull();
    expect(activationFrom(undefined)).toBeNull();
    expect(activationFrom("Reaction")).toBe("reaction");
    expect(featureInsertFromAi({ name: "x", description: "y", activation: "mythic" }, ctx)?.mechanics).toEqual({});
  });
});

describe("mechanicsFromAi", () => {
  const uses = { key: "ember", label: "Ember", amount: { kind: "fixed", value: 2 }, recharge: "short", pool: false };

  it("is empty when the model gave nothing", () => {
    expect(mechanicsFromAi({})).toEqual({});
  });

  it("keeps a valid mechanics object and lets the stated activation win", () => {
    expect(mechanicsFromAi({ activation: "reaction", mechanics: { activation: "action", uses } }))
      .toEqual({ activation: "reaction", uses });
  });

  it("leaves out a part the parser rejects but keeps the rest", () => {
    const out = mechanicsFromAi({ mechanics: { activation: "action", uses: { key: "Bad Key", label: "x" } } });
    expect(out).toEqual({ activation: "action" });
  });

  it("ignores a mechanics value that is not an object", () => {
    expect(mechanicsFromAi({ mechanics: "lots of fire", activation: "bonus_action" })).toEqual({ activation: "bonus_action" });
  });
});

describe("levelledFeaturesFromAi", () => {
  const opts = { maxPerLevel: 2, maxTotal: 10 };
  it("drops bad levels and duplicates, orders by level, accepts quoted numbers", () => {
    const out = levelledFeaturesFromAi(
      [
        { level: 5, name: "B", description: "b" },
        { level: "1", name: "A", description: "a" },
        { level: 1, name: "a", description: "dup" },
        { level: 0, name: "Z", description: "z" },
        { level: 21, name: "Y", description: "y" },
        { level: 3, name: "", description: "none" },
        "junk",
      ],
      undefined,
      ctx,
      opts,
    );
    expect(out.map((f) => [f.level, f.insert.name])).toEqual([[1, "A"], [5, "B"]]);
  });

  it("honours allowed levels and the per-level cap", () => {
    const out = levelledFeaturesFromAi(
      [1, 2, 3].map((n) => ({ level: 3, name: `F${n}`, description: "d" })).concat([{ level: 4, name: "G", description: "d" }]),
      undefined,
      ctx,
      { ...opts, allowedLevels: [3] },
    );
    expect(out.map((f) => f.insert.name)).toEqual(["F1", "F2"]);
  });

  it("is empty for non-arrays", () => {
    expect(levelledFeaturesFromAi("nope", undefined, ctx, opts)).toEqual([]);
  });
});

describe("featureIdsByLevel", () => {
  it("groups ids by the level of the draft at the same position", () => {
    const drafts = [1, 1, 3].map((level) => ({ level, insert: {} as ClassFeatureInsert }));
    expect(featureIdsByLevel(drafts, ["a", "b", "c"])).toEqual({ "1": ["a", "b"], "3": ["c"] });
  });

  it("places an existing feature among the created ones", () => {
    const drafts = [{ level: 1, insert: {} as ClassFeatureInsert }, { level: 4, existingId: "asi" }];
    expect(featureIdsByLevel(drafts, ["a", "asi"])).toEqual({ "1": ["a"], "4": ["asi"] });
  });
});

describe("createWithFeatures", () => {
  const inserts = [{ insert: { name: "a" } as ClassFeatureInsert }, { insert: { name: "b" } as ClassFeatureInsert }];

  it("creates features then the parent with their ids", async () => {
    let n = 0;
    const parent = await createWithFeatures(inserts, {
      createFeature: async () => ({ id: `f${++n}` }),
      deleteFeature: async () => {},
      createParent: async (ids) => ids,
    });
    expect(parent).toEqual(["f1", "f2"]);
  });

  it("points at an existing feature without creating or ever deleting it", async () => {
    const deleted: string[] = [];
    let n = 0;
    const items = [inserts[0]!, { existingId: "official-asi" }, inserts[1]!];
    const parent = await createWithFeatures(items, {
      createFeature: async () => ({ id: `f${++n}` }),
      deleteFeature: async (id) => { deleted.push(id); },
      createParent: async (ids) => ids,
    });
    expect(parent).toEqual(["f1", "official-asi", "f2"]);
    await expect(
      createWithFeatures(items, {
        createFeature: async () => ({ id: `g${++n}` }),
        deleteFeature: async (id) => { deleted.push(id); },
        createParent: async () => { throw new Error("insert failed"); },
      }),
    ).rejects.toThrow("insert failed");
    expect(deleted.sort()).toEqual(["g3", "g4"]);
  });

  it("deletes the created features when the parent fails", async () => {
    const deleted: string[] = [];
    let n = 0;
    await expect(
      createWithFeatures(inserts, {
        createFeature: async () => ({ id: `f${++n}` }),
        deleteFeature: async (id) => { deleted.push(id); },
        createParent: async () => { throw new Error("insert failed"); },
      }),
    ).rejects.toThrow("insert failed");
    expect(deleted).toEqual(["f1", "f2"]);
  });

  it("deletes the features created so far when a later feature fails", async () => {
    const deleted: string[] = [];
    let n = 0;
    await expect(
      createWithFeatures(inserts, {
        createFeature: async () => {
          if (++n === 2) throw new Error("boom");
          return { id: `f${n}` };
        },
        deleteFeature: async (id) => { deleted.push(id); },
        createParent: async () => "never",
      }),
    ).rejects.toThrow("boom");
    expect(deleted).toEqual(["f1"]);
  });
});
