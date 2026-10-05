import { describe, expect, it } from "vitest";
import { firstLevelOf, sanitizeResources, usesFromResource, withResourceFeatures, type AiResource } from "./resourceFeatures";
import type { NewFeatureDraft } from "./featureAi";
import { parseMechanics } from "@/rules/features/mechanics";

const ctx = { ruleset: "2024", campaignId: null, provenance: undefined } as const;

function drafted(name: string, level: number): NewFeatureDraft {
  return {
    level,
    insert: { name, description: "d", source: "Grimoire:AI", prerequisite: null, tags: [], open5e_import: false, campaign_id: null, kind: "feature", mechanics: {} },
  };
}

const table = (cells: number[]): AiResource => ({ key: "bolts", label: "Bolts", rest: "short", scaling: "table", table_values: cells });

describe("sanitizeResources", () => {
  it("dedupes keys and caps the count", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `R${i}`, scaling: "per_level" }));
    expect(sanitizeResources(many)).toHaveLength(6);
    expect(sanitizeResources([{ label: "X" }, { label: "x" }])).toHaveLength(1);
  });

  it("is empty for anything that is not a list", () => {
    expect(sanitizeResources(3)).toEqual([]);
  });
});

describe("usesFromResource", () => {
  it("maps each scaling to an amount the parser accepts", () => {
    const fixed = usesFromResource({ key: "a", label: "A", rest: "long", scaling: "fixed", fixed_value: 3 });
    expect(fixed).toMatchObject({ amount: { kind: "fixed", value: 3 }, recharge: "long", pool: false });
    expect(usesFromResource({ key: "b", label: "B", rest: "long", scaling: "per_level" }).amount).toEqual({ kind: "class_level", multiplier: 1 });
    const cells = [0, 0, 2, 2, 2, 3, ...Array(14).fill(3)];
    expect(usesFromResource(table(cells)).amount).toEqual({ kind: "by_level", values: { "3": 2, "6": 3 } });
    for (const r of [fixed, usesFromResource(table(cells))]) {
      expect(parseMechanics({ uses: r }).errors).toEqual([]);
    }
  });

  it("starts a table resource at the first level it has uses", () => {
    expect(firstLevelOf(table([0, 0, 2, ...Array(17).fill(2)]))).toBe(3);
    expect(firstLevelOf({ key: "a", label: "A", rest: "long", scaling: "per_level" })).toBe(1);
  });
});

describe("withResourceFeatures", () => {
  const fixed: AiResource = { key: "ember_charges", label: "Ember Charges", rest: "long", scaling: "fixed", fixed_value: 3 };

  it("gives a resource its own feature at its first level, in level order", () => {
    const out = withResourceFeatures([drafted("A", 1), drafted("B", 5)], [table([0, 0, 0, 0, 1, ...Array(15).fill(1)])], ctx);
    expect(out.map((f) => [f.level, f.insert.name])).toEqual([[1, "A"], [5, "B"], [5, "Bolts"]]);
    expect(out[2]?.insert.mechanics?.uses?.key).toBe("bolts");
  });

  it("puts the uses on a drafted feature of the same name instead of adding another", () => {
    const out = withResourceFeatures([drafted("Ember Charges", 2)], [fixed], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.insert.mechanics?.uses).toMatchObject({ key: "ember_charges", amount: { kind: "fixed", value: 3 } });
  });

  it("keeps the feature on a level the archetype actually grants", () => {
    const out = withResourceFeatures([drafted("A", 3)], [table([0, 0, 0, 0, 0, 1, ...Array(14).fill(1)])], { ...ctx, allowedLevels: [3, 7, 10] });
    expect(out.find((f) => f.insert.name === "Bolts")?.level).toBe(7);
  });
});
