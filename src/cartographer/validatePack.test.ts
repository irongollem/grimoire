import { describe, expect, it } from "vitest";
import { BASE_TILE_SIZE, TILE_PACK_SCHEMA, type TilePackManifest } from "./packSchema";
import { createDraftManifest, enumerateSchemaSlots, upsertManifestSlot } from "./authoringPlan";
import { formatMissingForDisplay, validatePack, type MissingSlot } from "./validatePack";

function emptyManifest(): TilePackManifest {
  return {
    pack_id: "test-pack",
    name: "Test Pack",
    description: "Validator fixture",
    pack_version: 1,
    schema_version: TILE_PACK_SCHEMA.version,
    base_tile_size: BASE_TILE_SIZE,
    assets: {},
  };
}

it("reports exact zero-based holes instead of accepting an equal-length random category", () => {
  const manifest = emptyManifest();
  manifest.assets.floor = Array.from({ length: 8 }, (_, index) => ({
    variant: index + 1,
    url: `floor/${index + 1}.webp`,
  }));

  expect(validatePack(manifest).missing).toContainEqual({
    category: "floor",
    variant: 0,
    reason: "random category needs at least 8 variants",
  });
});

describe("schema_version comparison", () => {
  it("does not warn about a pack older than the runtime schema (#804)", () => {
    const manifest = emptyManifest();
    manifest.schema_version = TILE_PACK_SCHEMA.version - 1;

    expect(validatePack(manifest).warnings).toEqual([]);
  });

  it("warns about a pack newer than the runtime schema", () => {
    const manifest = emptyManifest();
    manifest.schema_version = TILE_PACK_SCHEMA.version + 1;

    expect(validatePack(manifest).warnings).toContain(
      `Pack schema_version ${TILE_PACK_SCHEMA.version + 1} is newer than this app's schema version ${TILE_PACK_SCHEMA.version}. Some categories may not render correctly.`,
    );
  });

  it("does not warn when the pack matches the runtime schema exactly", () => {
    const manifest = emptyManifest();

    expect(validatePack(manifest).warnings).toEqual([]);
  });
});

describe("duplicate slot identities", () => {
  it("warns for duplicate variants", () => {
    const manifest = emptyManifest();
    manifest.assets.wallSegmentH = [
      { variant: 0, url: "wallSegmentH/0.webp" },
      { variant: 0, url: "wallSegmentH/duplicate.webp" },
    ];

    expect(validatePack(manifest).warnings).toContain("wallSegmentH/0: duplicate asset slot");
  });

  it("checks optional assets as part of the same WebP-only schema", () => {
    const manifest = emptyManifest();
    manifest.assets.objectChest = [
      { variant: 0, url: "objectChest/0.png" },
      { variant: 0, url: "objectChest/duplicate.png" },
    ];

    const result = validatePack(manifest);
    expect(result.warnings).toContain("objectChest/0: duplicate asset slot");
    expect(result.warnings).toContain("objectChest/0: non-WebP asset (objectChest/0.png); pipeline is WebP-only");
  });
});

describe("required slots", () => {
  function completeManifest(): TilePackManifest {
    const manifest = createDraftManifest({ packId: "full", name: "Full", description: "", packVersion: 1 });
    for (const slot of enumerateSchemaSlots(false)) upsertManifestSlot(manifest, slot, 100);
    return manifest;
  }

  it("calls a pack with every required slot valid, and one short of a slot invalid", () => {
    const manifest = completeManifest();
    expect(validatePack(manifest)).toMatchObject({ valid: true, missing: [] });
    manifest.assets.doorLeaf = [];
    const result = validatePack(manifest);
    expect(result.valid).toBe(false);
    expect(result.missing.map((m) => `${m.category}/${m.variant}`)).toEqual(["doorLeaf/0"]);
  });

  it("wants variants 0 to min-1 of a random category, however many others are there", () => {
    const manifest = completeManifest();
    // floor needs 8 (0..7): drop only the last
    manifest.assets.floor = manifest.assets.floor!.filter((s) => s.variant !== 7);
    expect(validatePack(manifest).missing).toEqual([
      { category: "floor", variant: 7, reason: "random category needs at least 8 variants" },
    ]);
  });
});

describe("variant ceilings", () => {
  const slots = (n: number, ext = "webp") => Array.from({ length: n }, (_, variant) => ({ variant, url: `x/${variant}.${ext}` }));

  it("warns when a random category holds more variants than the schema allows, and not at the limit", () => {
    const manifest = emptyManifest();
    manifest.assets.wallSegmentH = slots(6);
    expect(validatePack(manifest).warnings).toEqual([]);
    manifest.assets.wallSegmentH = slots(7);
    expect(validatePack(manifest).warnings).toContain("wallSegmentH: pack provides 7 variants, schema max is 6");
  });

  it("warns the same for an optional category, and not at the limit", () => {
    const manifest = emptyManifest();
    manifest.assets.curbPost = slots(2);
    expect(validatePack(manifest).warnings).toEqual([]);
    manifest.assets.curbPost = slots(3);
    expect(validatePack(manifest).warnings).toContain("curbPost: pack provides 3 variants, schema max is 2");
  });
});

describe("categories the schema does not know", () => {
  it("lists them as extras and does not fail the pack for them", () => {
    const manifest = emptyManifest();
    (manifest.assets as Record<string, unknown>).moat = [{ variant: 0, url: "moat/0.webp" }];
    const result = validatePack(manifest);
    expect(result.extras).toEqual(["moat"]);
    expect(validatePack(emptyManifest()).extras).toEqual([]);
  });
});

describe("formatMissingForDisplay", () => {
  const gaps = (n: number): MissingSlot[] => Array.from({ length: n }, (_, variant) => ({ category: "floor", variant, reason: "r" }));

  it("is empty for nothing missing, and names a side when there is one", () => {
    expect(formatMissingForDisplay([])).toBe("");
    expect(formatMissingForDisplay([{ category: "stairsUp", side: "N", variant: 2, reason: "r" }])).toBe("  • stairsUp/N/2");
  });

  it("shows ten and counts the rest, but does not claim a rest at exactly ten", () => {
    expect(formatMissingForDisplay(gaps(10)).split("\n")).toHaveLength(10);
    expect(formatMissingForDisplay(gaps(10))).not.toContain("more");
    const eleven = formatMissingForDisplay(gaps(11)).split("\n");
    expect(eleven).toHaveLength(11);
    expect(eleven[10]).toContain("1 more");
    expect(eleven[9]).toBe("  • floor/9");
  });
});
