import { describe, expect, it } from "vitest";
import type { Background } from "@/types/background.types";
import { mergeLibraryWithCustom } from "@/lib/library/libraryShadow";
import { backgroundFromLibraryRow, isLibraryBackground } from "./useBackgrounds";

function row(overrides: Partial<Omit<Background, "user_id">>): Omit<Background, "user_id"> {
  return {
    id: "srd_srd_2014_acolyte",
    name: "Acolyte",
    description: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    languages: [],
    equipment: null,
    feature_name: null,
    feature_description: null,
    feat_grant_name: null,
    feat_grant_description: null,
    asi_ability_trio: null,
    origin_feat: null,
    suggested_characteristics: null,
    tags: [],
    source: "srd-2014",
    image_url: null,
    focal_point: null,
    created_at: "2026-10-05T00:00:00Z",
    updated_at: "2026-10-05T00:00:00Z",
    source_document_key: "srd-2014",
    source_record_key: "srd-2014_acolyte",
    ...overrides,
  } as Omit<Background, "user_id">;
}

describe("isLibraryBackground", () => {
  it("is true for a library slug and false for a custom uuid", () => {
    expect(isLibraryBackground({ id: "srd_srd_2014_acolyte" })).toBe(true);
    expect(isLibraryBackground({ id: "97300000-0000-4000-8000-0000000000b1" })).toBe(false);
  });
});

describe("backgroundFromLibraryRow", () => {
  it("gives a library row no owner", () => {
    expect(backgroundFromLibraryRow(row({})).user_id).toBe("");
  });
});

describe("a custom background and a library one", () => {
  const library = backgroundFromLibraryRow(row({}));
  const sage = backgroundFromLibraryRow(
    row({ id: "srd_srd_2014_sage", name: "Sage", source_record_key: "srd-2014_sage" }),
  );

  it("are both listed, by name", () => {
    const homebrew = { ...row({ id: "97300000-0000-4000-8000-0000000000b1", name: "Bard's Apprentice", source: null, source_document_key: null, source_record_key: null }), user_id: "u1" } as Background;
    expect(mergeLibraryWithCustom([sage, library], [homebrew]).map((b) => b.name)).toEqual([
      "Acolyte",
      "Bard's Apprentice",
      "Sage",
    ]);
  });

  it("show once when the custom copy carries the library entry's book identity", () => {
    const copy = { ...row({ id: "97300000-0000-4000-8000-0000000000b2", description: "my edit" }), user_id: "u1" } as Background;
    const merged = mergeLibraryWithCustom([library, sage], [copy]);
    expect(merged.map((b) => b.id)).toEqual([copy.id, sage.id]);
  });
});
