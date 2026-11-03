import { describe, expect, it } from "vitest";
import type { BackgroundInsert } from "@/types/background.types";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import { buildSeededBackgroundRow, isSeedableDocument } from "./seed-library-backgrounds";

function mapped(overrides: Partial<BackgroundInsert>): BackgroundInsert {
  return {
    name: "Acolyte",
    description: null,
    skill_proficiencies: ["Insight", "Religion"],
    tool_proficiencies: [],
    languages: [],
    equipment: null,
    feature_name: "Shelter of the Faithful",
    feature_description: null,
    feat_grant_name: null,
    feat_grant_description: null,
    asi_ability_trio: null,
    origin_feat: null,
    suggested_characteristics: null,
    tags: [],
    source: "srd-2014",
    source_title: "System Reference Document 5.1",
    source_url: null,
    open5e_import: true,
    image_url: null,
    focal_point: null,
    ruleset: "2014",
    conceptual_key: "acolyte",
    source_document_key: "srd-2014",
    source_record_key: "srd-2014_acolyte",
    source_revision: null,
    source_license: "cc-by-40",
    provenance: {},
    ...overrides,
  };
}

describe("buildSeededBackgroundRow", () => {
  it("files the row under Open5e's document key as it comes, with a minted id", () => {
    const row = buildSeededBackgroundRow(
      mapped({ source: "tdcs", source_document_key: "tdcs", source_record_key: "tdcs_outlander", name: "Outlander" }),
    );
    expect(row).toMatchObject({
      id: "srd_tdcs_outlander",
      source: "tdcs",
      source_document_key: "tdcs",
      source_record_key: "tdcs_outlander",
    });
  });

  it("carries nothing of the per-user table and never the art", () => {
    const row = buildSeededBackgroundRow(mapped({ image_url: "https://x/y.webp" }));
    expect(row).not.toBeNull();
    for (const key of ["open5e_import", "ai_provenance", "image_url", "focal_point", "user_id"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it("refuses an A5E row: A5E is frozen and is not filed under 2014 any more (#934)", () => {
    const row = buildSeededBackgroundRow(
      mapped({ ruleset: null, provenance: { document: { gamesystem: { key: "a5e", name: "A5E" } } } }),
    );
    expect(row).toBeNull();
  });

  it("keeps what Open5e supplied, and falls back to the book's slug for a missing title", () => {
    const row = buildSeededBackgroundRow(mapped({ source_title: null }));
    expect(row).toMatchObject({ name: "Acolyte", skill_proficiencies: ["Insight", "Religion"], feature_name: "Shelter of the Faithful", source_title: "srd-2014" });
    expect(buildSeededBackgroundRow(mapped({}))?.source_title).toBe("System Reference Document 5.1");
  });

  it.each([
    ["no document key", { source_document_key: null }],
    ["no record key", { source_record_key: null }],
  ])("refuses a row with %s, since it could not be told apart on a re-run", (_name, over) => {
    expect(buildSeededBackgroundRow(mapped(over))).toBeNull();
  });

  it("refuses a document with no supported ruleset", () => {
    expect(buildSeededBackgroundRow(mapped({ ruleset: null, provenance: { document: { gamesystem: { key: "pf2e" } } } }))).toBeNull();
  });
});

describe("isSeedableDocument", () => {
  const base: Open5eDocumentRef = {
    key: "x",
    name: "X",
    gamesystem: { name: "5e", key: "5e-2014" },
    licenses: [{ name: "OGL", key: "ogl-10a" }],
  };

  it("takes a redistributable 5e document", () => {
    expect(isSeedableDocument(base)).toBe(true);
  });

  it("refuses a redistributable A5E document (frozen, #934)", () => {
    expect(isSeedableDocument({ ...base, gamesystem: { name: "A5E", key: "a5e" } })).toBe(false);
  });

  it("refuses an unlicensed document and a non-5e one", () => {
    expect(isSeedableDocument({ ...base, licenses: [] })).toBe(false);
    expect(isSeedableDocument({ ...base, gamesystem: { name: "PF", key: "pf2e" } })).toBe(false);
  });
});
