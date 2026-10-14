import { describe, expect, it } from "vitest";
import { hasCompleteArt } from "../../src/cartographer/packCoverage.ts";
import { enumerateSchemaSlots, slotRelativePath } from "../../src/cartographer/authoringPlan.ts";
import { TILE_PACK_SCHEMA } from "../../src/cartographer/packSchema.ts";
import { buildManifest, slotForPath } from "./tile-pack-publish.ts";

const base = { pack_id: "black-rock", name: "Black Rock", description: "Basalt.", pack_version: 1, palette: { floor: [1, 2, 3] as [number, number, number] } };

describe("slotForPath", () => {
  it("reads a plain and a directional slot", () => {
    expect(slotForPath("floor/7.webp")).toEqual({ category: "floor", variant: 7, relative: "floor/7.webp" });
    expect(slotForPath("stairsUp/E/0.webp")).toEqual({ category: "stairsUp", side: "E", variant: 0, relative: "stairsUp/E/0.webp" });
  });

  it("refuses what a manifest could not name", () => {
    expect(slotForPath("floor/a.webp")).toHaveProperty("error");
    expect(slotForPath("floor/7.png")).toHaveProperty("error");
    expect(slotForPath("lavaFall/0.webp")).toHaveProperty("error");
    expect(slotForPath("stairsUp/0.webp")).toHaveProperty("error");
    expect(slotForPath("stairsUp/NE/0.webp")).toHaveProperty("error");
    expect(slotForPath("floor/N/0.webp")).toHaveProperty("error");
    expect(slotForPath("floor/16.webp")).toHaveProperty("error");
  });
});

describe("buildManifest", () => {
  it("is a complete schema-3 pack when every required slot has a file, and keeps the palette", () => {
    const files = enumerateSchemaSlots(false).map((slot) => ({ relative: slotRelativePath(slot), byteSize: 100 }));
    const { manifest, errors } = buildManifest(base, files, 42);
    expect(errors).toEqual([]);
    expect(manifest.schema_version).toBe(TILE_PACK_SCHEMA.version);
    expect(manifest.palette).toEqual(base.palette);
    expect(hasCompleteArt(manifest)).toBe(true);
    expect(manifest.assets.floor?.every((slot) => slot.rev === 42 && slot.byteSize === 100)).toBe(true);
  });

  it("is incomplete without a required slot, and reports a stray file instead of dropping it silently", () => {
    const files = enumerateSchemaSlots(false).map((slot) => ({ relative: slotRelativePath(slot), byteSize: 100 }))
      .filter((f) => f.relative !== "doorOpenV/0.webp");
    const { manifest, errors } = buildManifest(base, [...files, { relative: "notes.webp", byteSize: 1 }], 1);
    expect(hasCompleteArt(manifest)).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it("orders variants numerically, so floor 10 follows floor 9", () => {
    const files = [10, 2, 9].map((v) => ({ relative: `floor/${v}.webp`, byteSize: 1 }));
    expect(buildManifest(base, files, 1).manifest.assets.floor?.map((s) => s.variant)).toEqual([2, 9, 10]);
  });
});
