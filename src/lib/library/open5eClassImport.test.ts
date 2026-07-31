import { afterEach, describe, expect, it, vi } from "vitest";
import {
  baseClassToInsert,
  classImportUpdateFields,
  fetchOpen5eBaseClasses,
  subclassImportUpdateFields,
  subclassToInsert,
} from "@/lib/open5eClassImport";
import type { Open5eClassPreview, Open5eSubclassPreview } from "@/lib/open5eClassImport";

// `licenses` is not decoration: fetchSupported5eDocumentKeys() refuses any
// document that lists none, so a fixture without them is silently dropped and
// the stray-document assertion fires instead of the behaviour under test. These
// are the licence keys Open5e actually reports for the two SRD documents.
const documents = {
  legacy: {
    key: "srd-2014",
    name: "System Reference Document 5.1",
    display_name: "5e 2014 Rules",
    gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
    licenses: [
      { key: "cc-by-40", name: "Creative Commons Attribution 4.0" },
      { key: "ogl-10a", name: "OPEN GAME LICENSE Version 1.0a" },
    ],
  },
  revised: {
    key: "srd-2024",
    name: "System Reference Document 5.2",
    display_name: "5e 2024 Rules",
    gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
    licenses: [{ key: "cc-by-40", name: "Creative Commons Attribution 4.0" }],
  },
};

function caster(key: string, document: typeof documents.legacy) {
  return {
    key,
    name: "Sorcerer",
    desc: "",
    hit_dice: "D6",
    caster_type: "FULL",
    saving_throws: [{ name: "Constitution", url: "" }],
    subclass_of: null,
    document,
    features: [{
      key: `${key}_spellcasting`,
      name: "Spellcasting",
      desc: "Cast spells.",
      feature_type: "CLASS_LEVEL_FEATURE",
      gained_at: [{ level: 1, detail: null }],
    }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Open5e V2 class identity", () => {
  it("keeps same-named editions and their features distinct", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/documents/")) {
        return new Response(JSON.stringify({
          count: 2, next: null, results: [documents.legacy, documents.revised],
        }));
      }
      return new Response(JSON.stringify({
        count: 2,
        next: null,
        results: [caster("srd_sorcerer", documents.legacy), caster("srd-2024_sorcerer", documents.revised)],
      }));
    }));

    const previews = await fetchOpen5eBaseClasses();
    expect(previews).toHaveLength(2);
    expect(previews.map(preview => preview.ruleset)).toEqual(["2014", "2024"]);
    expect(previews[0].sourceRecordKey).not.toBe(previews[1].sourceRecordKey);
    expect(previews[0].featureRecordsByLevel["1"][0].key)
      .not.toBe(previews[1].featureRecordsByLevel["1"][0].key);

    expect(previews.map(baseClassToInsert)).toMatchObject([
      { ruleset: "2014", source_document_key: "srd-2014", source_record_key: "srd_sorcerer" },
      { ruleset: "2024", source_document_key: "srd-2024", source_record_key: "srd-2024_sorcerer" },
    ]);
  });
});

const classPreview: Open5eClassPreview = {
  key: "srd-2024_wizard",
  name: "Wizard",
  source: "System Reference Document 5.2",
  ruleset: "2024",
  sourceDocumentKey: "srd-2024",
  sourceRecordKey: "srd-2024_wizard",
  sourceLicense: "cc-by-4.0",
  provenance: { provider: "open5e-v2" },
  hitDie: 6,
  savingThrows: ["Intelligence", "Wisdom"],
  featureNamesByLevel: {},
  featureRecordsByLevel: {},
};

const subclassPreview: Open5eSubclassPreview = {
  key: "srd-2024_evocation",
  name: "School of Evocation",
  desc: "Evokers focus on destructive spells.",
  source: "System Reference Document 5.2",
  ruleset: "2024",
  sourceDocumentKey: "srd-2024",
  sourceRecordKey: "srd-2024_evocation",
  sourceLicense: "cc-by-4.0",
  provenance: { provider: "open5e-v2" },
  parentClassName: "Wizard",
  featureNamesByLevel: {},
  featureRecordsByLevel: {},
};

describe("classImportUpdateFields", () => {
  it("never re-import-writes DM-configured mechanics, even though baseClassToInsert defaults them", () => {
    const update = classImportUpdateFields(baseClassToInsert(classPreview));

    expect(update).not.toHaveProperty("primary_ability");
    expect(update).not.toHaveProperty("armor_proficiencies");
    expect(update).not.toHaveProperty("weapon_proficiencies");
    expect(update).not.toHaveProperty("subclass_level");
    expect(update).not.toHaveProperty("asi_levels");
    expect(update).not.toHaveProperty("spell_slots");
    expect(update).not.toHaveProperty("spells_known");
    expect(update).not.toHaveProperty("cantrips_known");
    expect(update).not.toHaveProperty("slot_recovery");
    expect(update).not.toHaveProperty("caster_type");
    expect(update).not.toHaveProperty("prepared_ability");
    expect(update).not.toHaveProperty("prepared_divisor");
    expect(update).not.toHaveProperty("steps");
    expect(update).not.toHaveProperty("resources");
    expect(update).not.toHaveProperty("campaign_id");
    expect(update).not.toHaveProperty("features");
  });

  it("refreshes upstream identity, source metadata, hit die, and saving throws", () => {
    const update = classImportUpdateFields(baseClassToInsert(classPreview));

    expect(update).toMatchObject({
      class_name: "Wizard",
      ruleset: "2024",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_wizard",
      hit_die: 6,
      saving_throws: ["Intelligence", "Wisdom"],
    });
  });
});

describe("subclassImportUpdateFields", () => {
  it("never re-import-writes DM-configured mechanics, even though subclassToInsert defaults them", () => {
    const update = subclassImportUpdateFields(subclassToInsert(subclassPreview));

    expect(update).not.toHaveProperty("granted_spells");
    expect(update).not.toHaveProperty("steps");
    expect(update).not.toHaveProperty("resources");
    expect(update).not.toHaveProperty("hp_per_level");
    expect(update).not.toHaveProperty("campaign_id");
    expect(update).not.toHaveProperty("features");
  });

  it("refreshes upstream identity, source metadata, and description", () => {
    const update = subclassImportUpdateFields(subclassToInsert(subclassPreview));

    expect(update).toMatchObject({
      class_name: "Wizard",
      subclass_name: "School of Evocation",
      source_document_key: "srd-2024",
      source_record_key: "srd-2024_evocation",
      description: "Evokers focus on destructive spells.",
    });
  });
});
