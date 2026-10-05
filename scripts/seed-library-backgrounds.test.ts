import { describe, expect, it } from "vitest";
import type { BackgroundInsert } from "@/types/background.types";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import { buildSeededBackgroundRow, isSeedableDocument, ourDocumentKey } from "./seed-library-backgrounds";

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

describe("ourDocumentKey", () => {
  it("maps Open5e's key for a book back to the slug a campaign enables", () => {
    expect(ourDocumentKey("a5e-ag")).toBe("a5e");
    expect(ourDocumentKey("tdcs")).toBe("taldorei");
    expect(ourDocumentKey("open5e")).toBe("o5e");
  });

  it("leaves a key that has no alias alone", () => {
    expect(ourDocumentKey("srd-2024")).toBe("srd-2024");
    expect(ourDocumentKey("toh")).toBe("toh");
  });
});

describe("buildSeededBackgroundRow", () => {
  it("mints the id the migration minted and files the row under our slug", () => {
    const row = buildSeededBackgroundRow(
      mapped({ source: "a5e-ag", source_document_key: "a5e-ag", source_record_key: "a5e-ag_artisan", name: "Artisan" }),
    );
    expect(row).toMatchObject({
      id: "srd_a5e_ag_artisan",
      source: "a5e",
      source_document_key: "a5e",
      source_record_key: "a5e-ag_artisan",
    });
  });

  it("carries nothing of the per-user table and never the art", () => {
    const row = buildSeededBackgroundRow(mapped({ image_url: "https://x/y.webp" }));
    expect(row).not.toBeNull();
    for (const key of ["open5e_import", "ai_provenance", "image_url", "focal_point", "user_id"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it("files A5E under 2014, which it is built on", () => {
    const row = buildSeededBackgroundRow(
      mapped({ ruleset: null, provenance: { document: { gamesystem: { key: "a5e", name: "A5E" } } } }),
    );
    expect(row?.ruleset).toBe("2014");
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

  it("takes a redistributable 5e document and an A5E one", () => {
    expect(isSeedableDocument(base)).toBe(true);
    expect(isSeedableDocument({ ...base, gamesystem: { name: "A5E", key: "a5e" } })).toBe(true);
  });

  it("refuses an unlicensed document and a non-5e one", () => {
    expect(isSeedableDocument({ ...base, licenses: [] })).toBe(false);
    expect(isSeedableDocument({ ...base, gamesystem: { name: "PF", key: "pf2e" } })).toBe(false);
  });
});
