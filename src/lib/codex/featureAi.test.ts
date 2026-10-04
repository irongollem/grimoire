import { describe, expect, it } from "vitest";
import { featureIdsByLevel, featureInsertFromAi, featureTypeFrom, levelledFeaturesFromAi } from "./featureAi";
import { createWithFeatures } from "./featureBatch";
import type { ClassFeatureInsert } from "@/types/feature.types";

const ctx = { ruleset: "2024", campaignId: "camp-1" } as const;

describe("featureInsertFromAi", () => {
  it("builds a row with provenance, ruleset and campaign scope", () => {
    const prov = { edited: false } as never;
    const row = featureInsertFromAi(
      { name: " Ember Step ", description: "Move 10 feet.\n\nNo opportunity attacks.", feature_type: "Bonus Action", tags: ["Fire", "fire", "Move"], ai_provenance: prov },
      ctx,
    );
    expect(row).toMatchObject({
      name: "Ember Step",
      feature_type: "bonus_action",
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

  it("reads an unknown feature type as passive", () => {
    expect(featureTypeFrom("mythic")).toBe("passive");
    expect(featureTypeFrom(undefined)).toBe("passive");
    expect(featureTypeFrom("reaction")).toBe("reaction");
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
});

describe("createWithFeatures", () => {
  const inserts = [{ name: "a" }, { name: "b" }] as ClassFeatureInsert[];

  it("creates features then the parent with their ids", async () => {
    let n = 0;
    const parent = await createWithFeatures(inserts, {
      createFeature: async () => ({ id: `f${++n}` }),
      deleteFeature: async () => {},
      createParent: async (ids) => ids,
    });
    expect(parent).toEqual(["f1", "f2"]);
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
