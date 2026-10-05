import { describe, expect, it } from "vitest";
import {
  IMPORT_OWNED_FIELDS,
  jsonEqual,
  mergeImportedFeature,
  officialIdentity,
  planOfficialClassContent,
  sourceKeyForDocument,
  textToTiptap,
  unionFeatureMap,
} from "@/lib/library/officialClassContent";
import type { OfficialClassContentInput } from "@/lib/library/officialClassContent";
import type { Open5eV2Class } from "@/lib/library/open5eClassImport";
import type { Open5eV2Feat } from "@/lib/library/open5eFeatImport";
import type { OfficialClassContentCatalogues } from "@/lib/library/officialClassContent";

const srd2014 = {
  key: "srd-2014",
  name: "System Reference Document 5.1",
  gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
  licenses: [{ key: "cc-by-40", name: "CC" }, { key: "ogl-10a", name: "OGL" }],
};
const srd2024 = {
  key: "srd-2024",
  name: "System Reference Document 5.2",
  gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
  licenses: [{ key: "cc-by-40", name: "CC" }],
};
const taldorei = {
  key: "tdcs",
  name: "Tal'dorei Campaign Setting",
  gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
  licenses: [{ key: "ogl-10a", name: "OGL" }],
};
const unknownBook = {
  key: "mystery",
  name: "Mystery",
  gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
  licenses: [{ key: "ogl-10a", name: "OGL" }],
};

const sources = [
  { key: "srd-2014", open5e_key: null, is_redistributable: true },
  { key: "srd-2024", open5e_key: null, is_redistributable: true },
  { key: "taldorei", open5e_key: "tdcs", is_redistributable: true },
];

const noCatalogues: OfficialClassContentCatalogues = {
  features: { "2014": {}, "2024": {} },
  feats: { "2014": {}, "2024": {} },
};

function fighter(document: typeof srd2014, extra: Partial<Open5eV2Class> = {}): Open5eV2Class {
  return {
    key: `${document.key}_fighter`,
    name: "Fighter",
    desc: "",
    hit_dice: "D10",
    saving_throws: [{ name: "Strength", url: "" }],
    subclass_of: null,
    document,
    features: [
      {
        key: `${document.key}_fighter_asi`,
        name: "Ability Score Improvement",
        desc: "Raise scores.\n\nOr take a feat.",
        feature_type: "CLASS_LEVEL_FEATURE",
        gained_at: [4, 8, 12].map(level => ({ level, detail: null })),
      },
      {
        key: `${document.key}_fighter_second-wind`,
        name: "Second Wind",
        desc: "Heal.",
        feature_type: "CLASS_LEVEL_FEATURE",
        gained_at: [{ level: 1, detail: null }],
      },
      {
        key: `${document.key}_fighter_table`,
        name: "The Fighter table",
        desc: "",
        feature_type: "CLASS_TABLE_DATA",
        gained_at: [{ level: 1, detail: null }],
      },
    ],
    ...extra,
  };
}

function plan(overrides: Partial<OfficialClassContentInput> = {}) {
  return planOfficialClassContent({
    classes: [],
    feats: [],
    sources,
    existing: { features: [], subclasses: [], classes: [] },
    systemClasses: [{ id: "sys-fighter-2014", ruleset: "2014", class_name: "Fighter" }],
    catalogues: noCatalogues,
    ...overrides,
  });
}

describe("planOfficialClassContent", () => {
  it("puts a feature gained at several levels under each of them", () => {
    const result = plan({ classes: [fighter(srd2014)] });
    const [system] = result.systemClasses;
    const asi = officialIdentity("srd-2014", "srd-2014_fighter_asi", "2014");
    expect(system.featureMap["4"]).toEqual([asi]);
    expect(system.featureMap["8"]).toEqual([asi]);
    expect(system.featureMap["12"]).toEqual([asi]);
    expect(system.featureMap["1"]).toHaveLength(1);
    // One row, however many levels reference it; table data is not a feature.
    expect(result.features.map(f => f.insert.name).sort()).toEqual(["Ability Score Improvement", "Second Wind"]);
  });

  it("stamps a new row's provenance with the baseline of its owned fields", () => {
    const [first] = plan({ classes: [fighter(srd2014)] }).features;
    const provenance = first.insert.provenance as { provider: string; imported: Record<string, unknown> };
    expect(provenance.provider).toBe("open5e-v2");
    expect(Object.keys(provenance.imported).sort()).toEqual([...IMPORT_OWNED_FIELDS].sort());
    expect(provenance.imported.name).toBe(first.insert.name);
    expect(provenance.imported.description).toBe(first.insert.description);
  });

  it("routes an SRD base class to its system class and leaves custom_classes alone", () => {
    const result = plan({ classes: [fighter(srd2014)] });
    expect(result.systemClasses).toMatchObject([{ systemClassId: "sys-fighter-2014", ruleset: "2014" }]);
    expect(result.classes).toEqual([]);
  });

  it("makes a non-SRD base class an official custom class and maps the book to its source key", () => {
    const result = plan({
      classes: [fighter(taldorei, { name: "Blood Hunter", key: "tdcs_blood-hunter" })],
    });
    expect(result.systemClasses).toEqual([]);
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].insert).toMatchObject({
      class_name: "Blood Hunter",
      source: "taldorei",
      source_document_key: "tdcs",
      hit_die: 10,
      campaign_id: null,
    });
    expect(result.features[0].insert.source).toBe("taldorei");
  });

  it("skips a book that has no content source and says so", () => {
    const result = plan({ classes: [fighter(unknownBook)], feats: [] });
    expect(result.features).toEqual([]);
    expect(result.skippedDocuments).toEqual(["mystery"]);
  });

  it("skips a book the sources mark as not redistributable", () => {
    expect(sourceKeyForDocument("tdcs", [{ key: "taldorei", open5e_key: "tdcs", is_redistributable: false }])).toBeNull();
  });

  it("builds a subclass whose features sit at every level they are gained", () => {
    const subclass: Open5eV2Class = {
      key: "srd-2024_fighter_champion",
      name: "Champion",
      desc: "A fighter of prowess.",
      hit_dice: null,
      saving_throws: [],
      subclass_of: { key: "srd-2024_fighter", name: "Fighter" },
      document: srd2024,
      features: [{
        key: "srd-2024_fighter_champion_crit",
        name: "Improved Critical",
        desc: "Crit on 19.",
        feature_type: "CLASS_LEVEL_FEATURE",
        gained_at: [{ level: 3, detail: null }, { level: 15, detail: null }],
      }],
    };
    const result = plan({ classes: [subclass] });
    expect(result.subclasses).toHaveLength(1);
    const id = officialIdentity("srd-2024", "srd-2024_fighter_champion_crit", "2024");
    expect(result.subclasses[0].featureMap).toEqual({ "3": [id], "15": [id] });
    expect(result.subclasses[0].insert).toMatchObject({
      class_name: "Fighter",
      subclass_name: "Champion",
      description: "A fighter of prowess.",
      ruleset: "2024",
    });
    expect(Object.keys(result.subclasses[0].update)).not.toContain("granted_spells");
  });

  it("turns Open5e text into a Tiptap document, paragraph by paragraph", () => {
    const result = plan({ classes: [fighter(srd2014)] });
    const asi = result.features.find(f => f.insert.name === "Ability Score Improvement");
    expect(JSON.parse(asi!.insert.description!)).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Raise scores." }] },
        { type: "paragraph", content: [{ type: "text", text: "Or take a feat." }] },
      ],
    });
  });

  it("writes catalogue mechanics, cleaned, and the matching feature type", () => {
    const result = plan({
      classes: [fighter(srd2014)],
      catalogues: {
        ...noCatalogues,
        features: { "2014": { "srd-2014_fighter_second-wind": { activation: "bonus_action" } }, "2024": {} },
      },
    });
    const wind = result.features.find(f => f.insert.name === "Second Wind")!;
    expect(wind.insert.mechanics).toEqual({ activation: "bonus_action" });
    expect(result.features.find(f => f.insert.name === "Ability Score Improvement")!.insert.mechanics).toEqual({});
  });

  it("reports a catalogue entry that fails validation and keeps only what is valid", () => {
    const result = plan({
      classes: [fighter(srd2014)],
      catalogues: {
        ...noCatalogues,
        features: { "2014": { "srd-2014_fighter_second-wind": { activation: "nonsense" } } as never, "2024": {} },
      },
    });
    expect(result.features.find(f => f.insert.name === "Second Wind")!.insert.mechanics).toEqual({});
    expect(result.catalogueWarnings[0]).toContain("srd-2014_fighter_second-wind");
  });

  describe("feats", () => {
    const feat = (key: string, type: string | null, document: typeof srd2014): Open5eV2Feat => ({
      key,
      name: "Alert",
      desc: "You gain the following benefits.",
      prerequisite: " Level 4+ ",
      type,
      benefits: [{ desc: "Add your proficiency bonus." }],
      document,
    });

    it("gives a feature and a feat the same columns, because they are inserted in one batch", () => {
      // PostgREST fills a column one row of a batch lacks with NULL rather than
      // its default; a feature without `repeatable` broke the NOT NULL for all.
      const result = plan({ classes: [fighter(srd2014)], feats: [feat("srd-2014_alert", null, srd2014)] });
      const keySets = new Set(result.features.map(f => Object.keys(f.insert).sort().join(",")));
      expect(result.features.some(f => f.insert.kind === "feat")).toBe(true);
      expect(keySets.size).toBe(1);
    });

    it("makes a feat a feat, with benefits as bullets and the category mapped from Open5e's type", () => {
      const result = plan({ feats: [feat("srd-2024_alert", "Fighting Style", srd2024)] });
      const [row] = result.features;
      expect(row.insert).toMatchObject({
        kind: "feat",
        feat_category: "fighting_style",
        prerequisite: "Level 4+",
        repeatable: false,
        prerequisites: null,
        ability_increase: null,
      });
      expect(JSON.parse(row.insert.description!).content[1].type).toBe("bulletList");
    });

    it("gives a 2014 feat no category", () => {
      const result = plan({ feats: [feat("srd-2014_alert", "GENERAL", srd2014)] });
      expect(result.features[0].insert.feat_category).toBeNull();
    });

    it("takes category, prerequisites, repeatable and ability increase from the catalogue", () => {
      const result = plan({
        feats: [feat("srd-2024_alert", "General", srd2024)],
        catalogues: {
          ...noCatalogues,
          feats: {
            "2014": {},
            "2024": {
              "srd-2024_alert": {
                category: "origin",
                prerequisites: { level: 4 },
                repeatable: true,
                ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 },
                mechanics: {},
              },
            },
          },
        },
      });
      expect(result.features[0].insert).toMatchObject({
        feat_category: "origin",
        prerequisites: { level: 4 },
        repeatable: true,
        ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 },
      });
    });
  });

  it("matches existing rows by identity, and counts rows the source no longer lists without deleting", () => {
    const result = plan({
      classes: [fighter(srd2014)],
      existing: {
        features: [
          { id: "f-wind", source_document_key: "srd-2014", source_record_key: "srd-2014_fighter_second-wind", ruleset: "2014" },
          { id: "f-gone", source_document_key: "srd-2014", source_record_key: "srd-2014_fighter_removed", ruleset: "2014" },
          { id: "f-seed", source_document_key: null, source_record_key: null, ruleset: null },
        ],
        subclasses: [{ id: "s-gone", source_document_key: "srd-2014", source_record_key: "x", ruleset: "2014" }],
        classes: [],
      },
    });
    expect(result.features.find(f => f.insert.name === "Second Wind")!.existingId).toBe("f-wind");
    expect(result.features.find(f => f.insert.name === "Ability Score Improvement")!.existingId).toBeNull();
    expect(result.notListed).toEqual({ features: 1, subclasses: 1, classes: 0 });
  });
});

describe("textToTiptap", () => {
  it("returns an empty document for empty text", () => {
    expect(JSON.parse(textToTiptap(""))).toEqual({ type: "doc", content: [] });
  });
});

const OWNED_NOW = {
  name: "Rage",
  description: "old text",
  prerequisite: null,
  mechanics: { a: 1, b: 2 },
  feat_category: null,
  prerequisites: null,
  repeatable: false,
  ability_increase: null,
};
const OWNED_NEW = { ...OWNED_NOW, description: "new text", mechanics: { b: 2, a: 1 } };

describe("mergeImportedFeature", () => {
  it("refreshes an untouched field and moves its baseline", () => {
    const current = { ...OWNED_NOW, provenance: { provider: "open5e-v2", imported: { ...OWNED_NOW } } };
    const { update, kept } = mergeImportedFeature(current, { ...OWNED_NEW, provenance: { provider: "open5e-v2" } });
    expect(update.description).toBe("new text");
    expect((update.provenance as { imported: { description: string } }).imported.description).toBe("new text");
    expect(kept).toEqual([]);
  });

  it("keeps an edited description and counts it", () => {
    const current = {
      ...OWNED_NOW,
      description: "admin wrote this",
      provenance: { imported: { ...OWNED_NOW } },
    };
    const { update, kept } = mergeImportedFeature(current, { ...OWNED_NEW, provenance: {} });
    expect("description" in update).toBe(false);
    expect(kept).toEqual(["description"]);
    // The baseline stays "old text", and with nothing else moving it is not rewritten.
    expect(update.provenance).toBeUndefined();
  });

  it("fills an empty field that has no baseline", () => {
    const current = { ...OWNED_NOW, mechanics: {}, provenance: {} };
    const { update, kept } = mergeImportedFeature(current, { ...OWNED_NEW, mechanics: { a: 1 }, provenance: {} });
    expect(update.mechanics).toEqual({ a: 1 });
    expect(kept).not.toContain("mechanics");
  });

  it("keeps a non-empty field that has no baseline", () => {
    const current = { ...OWNED_NOW, provenance: {} };
    const { update, kept } = mergeImportedFeature(current, { ...OWNED_NEW, provenance: {} });
    expect("description" in update).toBe(false);
    expect(kept).toContain("description");
    expect((update.provenance as { imported: Record<string, unknown> }).imported).not.toHaveProperty("description");
  });

  it("treats repeatable false as empty", () => {
    const current = { ...OWNED_NOW, provenance: {} };
    const { update } = mergeImportedFeature(current, { ...OWNED_NOW, repeatable: true, provenance: {} });
    expect(update.repeatable).toBe(true);
  });

  it("writes nothing when the row already matches, and never touches tags", () => {
    const current = { ...OWNED_NOW, source: "x", provenance: { imported: { ...OWNED_NOW } } };
    const { update, kept } = mergeImportedFeature(current, { ...OWNED_NOW, source: "x", tags: ["a"], provenance: {} });
    expect(update).toEqual({});
    expect(kept).toEqual([]);
  });

  it("owns exactly the eight documented fields", () => {
    expect([...IMPORT_OWNED_FIELDS]).toHaveLength(8);
  });
});

describe("jsonEqual", () => {
  it("ignores key order but not array order", () => {
    expect(jsonEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe("unionFeatureMap", () => {
  it("keeps a hand-added id and adds a new level", () => {
    const merged = unionFeatureMap({ "1": ["a", "hand"] }, { "1": ["a", "b"], "2": ["c"] });
    expect(merged).toEqual({ "1": ["a", "hand", "b"], "2": ["c"] });
  });
  it("accepts a null current map", () => {
    expect(unionFeatureMap(null, { "1": ["a"] })).toEqual({ "1": ["a"] });
  });
});
