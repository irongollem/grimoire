import { describe, expect, it } from "vitest";
import {
  MECHANICS_COLUMNS,
  type LegacyRow,
  type V2Spell,
  buildPatch,
  gainsRoll,
  matchLegacyRow,
  normalizeName,
  planRow,
} from "./legacyEnrichment";

const row = (over: Partial<LegacyRow> = {}): LegacyRow => ({
  id: "legacy-1",
  name: "Abrupt Hug",
  description: "A hug.",
  source_document_key: "dmag",
  mechanics_reviewed: false,
  provenance: { provider: "open5e", api_version: "v1" },
  damage_rolls: null,
  healing_dice: null,
  ...over,
});

const v2 = (over: Partial<V2Spell> = {}): V2Spell => ({
  name: "Abrupt Hug",
  description: "A hug.",
  source_document_key: "deepm",
  source_record_key: "deepm_abrupt-hug",
  damage_rolls: [{ dice: "1d6", type: "bludgeoning" }],
  healing_dice: null,
  attack_type: "save",
  save_attribute: "STR",
  save_effect: "negates",
  higher_level_damage: null,
  higher_level_healing: null,
  effects: [{ id: "base" }],
  casting_options: [],
  effect_schema_version: 1,
  ...over,
});

describe("matching a legacy row to a v2 spell", () => {
  it("treats curly apostrophes, case and spacing as the same name", () => {
    const hit = matchLegacyRow(row({ name: "Mordenkainen’s  Escape" }), [v2({ name: "mordenkainen's escape" })]);
    expect(hit.status).toBe("matched");
  });

  it("does not guess between two v2 spells with the same normalised name", () => {
    const result = matchLegacyRow(row(), [v2(), v2({ source_record_key: "deepm_abrupt-hug-2", name: "ABRUPT  hug" })]);
    expect(result.status).toBe("ambiguous");
  });

  it("only looks inside the mapped v2 document", () => {
    const result = matchLegacyRow(row(), [v2({ source_document_key: "toh" })]);
    expect(result.status).toBe("unmatched");
  });

  it("strips a trailing parenthetical only when the plain name found nothing", () => {
    const fallback = matchLegacyRow(row({ name: "Bless (Ritual)" }), [v2({ name: "Bless" })]);
    expect(fallback).toMatchObject({ status: "matched", via: "parenthetical" });
    const exactWins = matchLegacyRow(row({ name: "Bless (Ritual)" }), [
      v2({ name: "Bless (Ritual)", source_record_key: "a" }),
      v2({ name: "Bless", source_record_key: "b" }),
    ]);
    expect(exactWins).toMatchObject({ status: "matched", via: "exact" });
  });

  it("normalises names the same way both sides", () => {
    expect(normalizeName("  Tasha’s   Hideous ")).toBe("tasha's hideous");
  });
});

describe("the PATCH body", () => {
  it("carries mechanics columns and provenance only, never description or name", () => {
    const patch = buildPatch(row(), v2({ description: "Different text", name: "Other" }), "2026-10-31T00:00:00Z");
    expect(Object.keys(patch).sort()).toEqual([...MECHANICS_COLUMNS, "provenance"].sort());
    expect(patch).not.toHaveProperty("description");
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("mechanics_reviewed");
  });

  it("merges into existing provenance instead of replacing it", () => {
    const patch = buildPatch(row(), v2(), "T");
    expect(patch.provenance).toEqual({
      provider: "open5e",
      api_version: "v1",
      mechanics_enriched_from: { provider: "open5e", api_version: "v2", document: "deepm", record: "deepm_abrupt-hug", at: "T" },
    });
  });

  it("tolerates a legacy row with null provenance", () => {
    expect(buildPatch(row({ provenance: null }), v2(), "T").provenance).toHaveProperty("mechanics_enriched_from");
  });
});

describe("planning a row", () => {
  it("never patches a mechanics_reviewed row", () => {
    expect(planRow(row({ mechanics_reviewed: true }), [v2()], "T")).toMatchObject({ outcome: "skipped_reviewed" });
    expect(planRow(row({ mechanics_reviewed: true }), [v2()], "T").patch).toBeUndefined();
  });

  it("skips a document with no v2 mapping", () => {
    expect(planRow(row({ source_document_key: "srd" }), [v2()], "T").outcome).toBe("unmapped_document");
  });

  it("flags a description difference beyond whitespace, not whitespace alone", () => {
    expect(planRow(row({ description: "A  hug. " }), [v2()], "T").descriptionDiffers).toBe(false);
    expect(planRow(row({ description: "A big hug." }), [v2()], "T").descriptionDiffers).toBe(true);
  });

  it("counts a roll gained only when the legacy row had none", () => {
    expect(gainsRoll(row(), v2())).toBe(true);
    expect(gainsRoll(row({ healing_dice: "1d8" }), v2())).toBe(false);
    expect(gainsRoll(row(), v2({ damage_rolls: [], healing_dice: null }))).toBe(false);
  });
});
