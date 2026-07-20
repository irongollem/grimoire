import { afterEach, describe, expect, it, vi } from "vitest";
import { baseClassToInsert, fetchOpen5eBaseClasses } from "./open5eClassImport";

const documents = {
  legacy: {
    key: "srd-2014",
    name: "System Reference Document 5.1",
    display_name: "5e 2014 Rules",
    gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
  },
  revised: {
    key: "srd-2024",
    name: "System Reference Document 5.2",
    display_name: "5e 2024 Rules",
    gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      count: 2,
      next: null,
      results: [caster("srd_sorcerer", documents.legacy), caster("srd-2024_sorcerer", documents.revised)],
    }))));

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
