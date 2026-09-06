import { describe, expect, it } from "vitest";
import {
  resolveCellGlyphs,
  HAZARD_GLYPH_CATEGORY,
  FEATURE_GLYPH_CATEGORY,
  GENERIC_HAZARD_CATEGORY,
  GENERIC_FEATURE_CATEGORY,
} from "./glyphs";
import { HAZARD_GLYPHS } from "@/types/trap.types";
import { FEATURE_GLYPHS } from "@/types/dungeonFeature.types";
import type { CellKey, CellMetadata } from "@/types/dungeonMap.types";

describe("resolveCellGlyphs", () => {
  it("resolves a trap's hazard_glyph to its pack category", () => {
    const metadata: Record<CellKey, CellMetadata> = { "1,1": { trap_id: "t1" } };
    const traps = new Map([["t1", { hazard_glyph: "pit" as const }]]);

    expect(resolveCellGlyphs(metadata, traps, new Map())).toEqual({ "1,1": "hazardPit" });
  });

  it("falls back to the generic hazard marker when the trap's glyph is null", () => {
    const metadata: Record<CellKey, CellMetadata> = { "1,1": { trap_id: "t1" } };
    const traps = new Map([["t1", { hazard_glyph: null }]]);

    expect(resolveCellGlyphs(metadata, traps, new Map())).toEqual({ "1,1": GENERIC_HAZARD_CATEGORY });
  });

  it("falls back to the generic hazard marker when the linked trap can't be found", () => {
    // A trap can be deleted, or scoped out of a lookup built without
    // includeAllScopes — either way the placement must still draw SOMETHING.
    const metadata: Record<CellKey, CellMetadata> = { "1,1": { trap_id: "missing" } };

    expect(resolveCellGlyphs(metadata, new Map(), new Map())).toEqual({ "1,1": GENERIC_HAZARD_CATEGORY });
  });

  it("resolves a feature's feature_glyph to its pack category", () => {
    const metadata: Record<CellKey, CellMetadata> = { "2,2": { feature_id: "f1" } };
    const features = new Map([["f1", { feature_glyph: "fountain" as const }]]);

    expect(resolveCellGlyphs(metadata, new Map(), features)).toEqual({ "2,2": "featureFountain" });
  });

  it("falls back to the generic feature marker when the feature's glyph is null", () => {
    const metadata: Record<CellKey, CellMetadata> = { "2,2": { feature_id: "f1" } };
    const features = new Map([["f1", { feature_glyph: null }]]);

    expect(resolveCellGlyphs(metadata, new Map(), features)).toEqual({ "2,2": GENERIC_FEATURE_CATEGORY });
  });

  it("prefers the trap when a cell somehow carries both a trap_id and a feature_id", () => {
    const metadata: Record<CellKey, CellMetadata> = { "1,1": { trap_id: "t1", feature_id: "f1" } };
    const traps = new Map([["t1", { hazard_glyph: "blade" as const }]]);
    const features = new Map([["f1", { feature_glyph: "altar" as const }]]);

    expect(resolveCellGlyphs(metadata, traps, features)).toEqual({ "1,1": "hazardBlade" });
  });

  it("produces no entry for a cell with neither a trap nor a feature link", () => {
    const metadata: Record<CellKey, CellMetadata> = { "1,1": { note_id: "n1" } };

    expect(resolveCellGlyphs(metadata, new Map(), new Map())).toEqual({});
  });

  it("maps every declared hazard and feature glyph value to a pack category", () => {
    for (const glyph of HAZARD_GLYPHS) expect(HAZARD_GLYPH_CATEGORY[glyph]).toMatch(/^hazard/);
    for (const glyph of FEATURE_GLYPHS) expect(FEATURE_GLYPH_CATEGORY[glyph]).toMatch(/^feature/);
  });
});
