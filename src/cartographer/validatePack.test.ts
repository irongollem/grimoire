import { describe, expect, it } from "vitest";
import { BASE_TILE_SIZE, TILE_PACK_SCHEMA, type TilePackManifest } from "./packSchema";
import { validatePack } from "./validatePack";

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

describe("duplicate slot identities", () => {
  it("warns for duplicate variants", () => {
    const manifest = emptyManifest();
    manifest.assets.doorClosedH = [
      { variant: 0, url: "doorClosedH/0.webp" },
      { variant: 0, url: "doorClosedH/duplicate.webp" },
    ];

    expect(validatePack(manifest).warnings).toContain("doorClosedH/0: duplicate asset slot");
  });

  it("checks optional assets as part of the same WebP-only schema", () => {
    const manifest = emptyManifest();
    manifest.assets.objectChest = [
      { variant: 0, url: "objectChest/0.png" },
      { variant: 0, url: "objectChest/duplicate.png" },
    ];

    const result = validatePack(manifest);
    expect(result.warnings).toContain("objectChest/0: duplicate asset slot");
    expect(result.warnings).toContain("objectChest/0: non-WebP asset (objectChest/0.png) — pipeline is WebP-only");
  });
});
