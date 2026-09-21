import { describe, expect, it } from "vitest";
import {
  PROOF_SLOTS,
  TILE_BASE_PREFIX,
  baseReferenceCandidates,
  initialGenerationStatus,
  parseTileSlot,
  validateLibraryPackPatch,
} from "./libraryActions";
import { enumerateSchemaSlots, slotId } from "../../../src/cartographer/authoringPlan";

describe("initialGenerationStatus", () => {
  it("opens in proof_pending when the plan includes all three proof slots", () => {
    const jobs = [...PROOF_SLOTS].map((id) => ({ id })).concat({ id: "floor:1" });
    expect(initialGenerationStatus(jobs)).toBe("proof_pending");
  });

  it("opens in proof_pending when the plan includes even one proof slot", () => {
    expect(initialGenerationStatus([{ id: "floor:0" }, { id: "floor:1" }])).toBe("proof_pending");
  });

  it("skips straight to generating when the plan has no proof slots — the wood-interior case", () => {
    // wood-interior already has its floor/wall/solidBlock tiles drawn, so a
    // gap-filling run's plan never includes them. Left in proof_pending, the
    // run could never reach awaiting_approval (nothing would ever complete
    // the proof phase) and would hang forever.
    const jobs = [{ id: "doorClosedH:0" }, { id: "wallJoint:L_NE:0" }];
    expect(initialGenerationStatus(jobs)).toBe("generating");
  });

  it("treats an empty job list as having no proof slots", () => {
    expect(initialGenerationStatus([])).toBe("generating");
  });
});

describe("parseTileSlot", () => {
  const knownIds = new Set(enumerateSchemaSlots(true).map(slotId));

  it("accepts a legal non-directional slot", () => {
    const result = parseTileSlot({ category: "floor", variant: 0 }, knownIds);
    expect(result).toEqual({ ok: true, slot: { category: "floor", variant: 0 } });
  });

  it("accepts a legal directional slot with its side", () => {
    const result = parseTileSlot({ category: "wallJoint", side: "L_NE", variant: 0 }, knownIds);
    expect(result).toEqual({ ok: true, slot: { category: "wallJoint", side: "L_NE", variant: 0 } });
  });

  it("rejects a directional slot missing its required side", () => {
    // "wallJoint:0" (no side) is not a member of the schema's slot ids —
    // every wallJoint slot is keyed by side.
    expect(parseTileSlot({ category: "wallJoint", variant: 0 }, knownIds)).toEqual({ ok: false });
  });

  it("rejects an unknown category", () => {
    expect(parseTileSlot({ category: "notARealCategory", variant: 0 }, knownIds)).toEqual({ ok: false });
  });

  it("rejects a negative variant", () => {
    expect(parseTileSlot({ category: "floor", variant: -1 }, knownIds)).toEqual({ ok: false });
  });

  it("rejects a non-integer variant", () => {
    expect(parseTileSlot({ category: "floor", variant: 1.5 }, knownIds)).toEqual({ ok: false });
  });

  it("rejects a variant beyond the category's max", () => {
    // floor's schema max is 16 (index 0-15), so 999 is out of range even
    // though it is a valid integer.
    expect(parseTileSlot({ category: "floor", variant: 999 }, knownIds)).toEqual({ ok: false });
  });

  it("rejects a non-string side", () => {
    expect(parseTileSlot({ category: "wallJoint", side: 1, variant: 0 }, knownIds)).toEqual({ ok: false });
  });

  it("rejects a missing body", () => {
    expect(parseTileSlot(undefined, knownIds)).toEqual({ ok: false });
    expect(parseTileSlot(null, knownIds)).toEqual({ ok: false });
    expect(parseTileSlot("floor:0", knownIds)).toEqual({ ok: false });
  });
});

describe("validateLibraryPackPatch", () => {
  it("rejects an empty patch as no_changes", () => {
    expect(validateLibraryPackPatch({})).toEqual({ ok: false, error: "no_changes" });
    expect(validateLibraryPackPatch({ action: "update_library_pack", pack_id: "row-1" })).toEqual({ ok: false, error: "no_changes" });
  });

  it("trims and accepts a valid name", () => {
    expect(validateLibraryPackPatch({ name: "  Haunted Manor  " })).toEqual({ ok: true, patch: { name: "Haunted Manor" } });
  });

  it("rejects an empty or over-long name", () => {
    expect(validateLibraryPackPatch({ name: "   " })).toEqual({ ok: false, error: "invalid_pack_concept" });
    expect(validateLibraryPackPatch({ name: "x".repeat(101) })).toEqual({ ok: false, error: "invalid_pack_concept" });
    expect(validateLibraryPackPatch({ name: 42 })).toEqual({ ok: false, error: "invalid_pack_concept" });
  });

  it("accepts a description at exactly the 1000-char bound and rejects one over it", () => {
    expect(validateLibraryPackPatch({ description: "x".repeat(1000) })).toEqual({ ok: true, patch: { description: "x".repeat(1000) } });
    expect(validateLibraryPackPatch({ description: "x".repeat(1001) })).toEqual({ ok: false, error: "invalid_pack_concept" });
  });

  it("accepts an empty description", () => {
    expect(validateLibraryPackPatch({ description: "" })).toEqual({ ok: true, patch: { description: "" } });
  });

  it("accepts a list of non-empty license keys", () => {
    expect(validateLibraryPackPatch({ license_keys: ["cc0", "ogl-10a"] })).toEqual({ ok: true, patch: { license_keys: ["cc0", "ogl-10a"] } });
  });

  it("rejects license_keys that is not an array, or contains a non-string or empty entry", () => {
    expect(validateLibraryPackPatch({ license_keys: "cc0" })).toEqual({ ok: false, error: "invalid_license_keys" });
    expect(validateLibraryPackPatch({ license_keys: ["cc0", ""] })).toEqual({ ok: false, error: "invalid_license_keys" });
    expect(validateLibraryPackPatch({ license_keys: ["cc0", 1] })).toEqual({ ok: false, error: "invalid_license_keys" });
  });

  it("accepts null or a string content_source_key", () => {
    expect(validateLibraryPackPatch({ content_source_key: null })).toEqual({ ok: true, patch: { content_source_key: null } });
    expect(validateLibraryPackPatch({ content_source_key: "grimoire-art" })).toEqual({ ok: true, patch: { content_source_key: "grimoire-art" } });
  });

  it("rejects a non-string, non-null content_source_key", () => {
    expect(validateLibraryPackPatch({ content_source_key: 7 })).toEqual({ ok: false, error: "invalid_content_source" });
  });

  it("accepts a non-negative integer sort_order and rejects a negative or fractional one", () => {
    expect(validateLibraryPackPatch({ sort_order: 0 })).toEqual({ ok: true, patch: { sort_order: 0 } });
    expect(validateLibraryPackPatch({ sort_order: -1 })).toEqual({ ok: false, error: "invalid_sort_order" });
    expect(validateLibraryPackPatch({ sort_order: 1.5 })).toEqual({ ok: false, error: "invalid_sort_order" });
    expect(validateLibraryPackPatch({ sort_order: "3" })).toEqual({ ok: false, error: "invalid_sort_order" });
  });

  it("validates every present field and merges them into one patch", () => {
    expect(validateLibraryPackPatch({ name: "Renamed", sort_order: 4 })).toEqual({
      ok: true,
      patch: { name: "Renamed", sort_order: 4 },
    });
  });

  it("returns the first invalid field's error even when other fields are valid", () => {
    expect(validateLibraryPackPatch({ name: "Fine", sort_order: -1 })).toEqual({ ok: false, error: "invalid_sort_order" });
  });
});

describe("baseReferenceCandidates", () => {
  it("tries the side-specific file before the category-wide one", () => {
    expect(baseReferenceCandidates({ category: "wallRoundJoint", side: "L_NE" })).toEqual([
      "_base/v1/wallRoundJoint-L_NE.webp",
      "_base/v1/wallRoundJoint.webp",
    ]);
  });

  /**
   * The case the fallback exists for. `wallJoint` is one geometry serving all
   * nine sides — the renderer scales it to a band-sized square at the grid
   * intersection, so an L, a T and a cross are the same shape. Nine files would
   * be nine copies, so the lookup drops to the category file instead.
   */
  it("falls back to the category file, which is how one wallJoint serves nine sides", () => {
    for (const side of ["L_NE", "T_N", "CROSS"]) {
      expect(baseReferenceCandidates({ category: "wallJoint", side })).toContain("_base/v1/wallJoint.webp");
    }
  });

  it("asks for one file when a category has no sides", () => {
    expect(baseReferenceCandidates({ category: "floor" })).toEqual(["_base/v1/floor.webp"]);
    expect(baseReferenceCandidates({ category: "doorOpenH" })).toEqual(["_base/v1/doorOpenH.webp"]);
  });

  it("names every file the seed script actually writes", async () => {
    // Guards the one thing a unit test can check about a two-sided contract:
    // that the edge function asks for names `scripts/seed-tile-base.ts` uploads.
    // A typo either side means a silently missing reference — the generator
    // would carry on and simply produce worse tiles.
    const { readdirSync } = await import("node:fs");
    const seeded = new Set(
      readdirSync("src/assets/tile-base")
        .filter((f) => f.endsWith(".svg"))
        .map((f) => `${TILE_BASE_PREFIX}/${f.replace(/\.svg$/, "")}.webp`),
    );
    const grid = [
      { category: "floor" }, { category: "solidBlock" },
      { category: "wallSegmentH" }, { category: "wallSegmentV" },
      { category: "doorClosedH" }, { category: "doorClosedV" },
      { category: "doorOpenH" }, { category: "doorOpenV" },
      { category: "wallJoint", side: "CROSS" },
      { category: "wallRoundJoint", side: "L_SW" },
      { category: "stairsUp", side: "E" }, { category: "stairsDown", side: "W" },
    ];
    for (const slot of grid) {
      const hit = baseReferenceCandidates(slot).find((c) => seeded.has(c));
      expect(hit, `no seeded base tile answers for ${slot.category}/${slot.side ?? "-"}`).toBeTruthy();
    }
  });

  it("resolves to nothing for the overlays, which deliberately have no base tile", async () => {
    const { readdirSync } = await import("node:fs");
    const seeded = new Set(
      readdirSync("src/assets/tile-base")
        .filter((f) => f.endsWith(".svg"))
        .map((f) => `${TILE_BASE_PREFIX}/${f.replace(/\.svg$/, "")}.webp`),
    );
    for (const category of ["rubble", "debris", "objectChest", "hazardPit", "featureAltar"]) {
      expect(baseReferenceCandidates({ category }).some((c) => seeded.has(c))).toBe(false);
    }
  });
});
