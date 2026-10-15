import { describe, expect, it } from "vitest";
import { hasCompleteArt } from "../../src/cartographer/packCoverage.ts";
import { enumerateSchemaSlots, slotRelativePath } from "../../src/cartographer/authoringPlan.ts";
import { TILE_PACK_SCHEMA } from "../../src/cartographer/packSchema.ts";
import { buildManifest, parsePackSidecar, slotForPath } from "./tile-pack-publish.ts";

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
    expect(slotForPath("floor/64.webp")).toHaveProperty("error");
  });
});

describe("buildManifest", () => {
  it("is a complete current-schema pack when every required slot has a file, and keeps the palette", () => {
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
      .filter((f) => f.relative !== "doorLeaf/0.webp");
    const { manifest, errors } = buildManifest(base, [...files, { relative: "notes.webp", byteSize: 1 }], 1);
    expect(hasCompleteArt(manifest)).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it("orders variants numerically, so floor 10 follows floor 9", () => {
    const files = [10, 2, 9].map((v) => ({ relative: `floor/${v}.webp`, byteSize: 1 }));
    expect(buildManifest(base, files, 1).manifest.assets.floor?.map((s) => s.variant)).toEqual([2, 9, 10]);
  });
});

describe("pack.json sidecar", () => {
  const files = enumerateSchemaSlots(false).map((slot) => ({ relative: slotRelativePath(slot), byteSize: 100 }));
  const good = {
    continuous: { floor: 8, terrainWater: 4 },
    labels: { wallDecal: ["Outflow pipe", "Rat hole"] },
    doorLeaf: { hingeX: 0.25, hingeY: 0.5, openDegrees: 80 },
  };

  it("copies a valid sidecar into the manifest", () => {
    const { sidecar, errors } = parsePackSidecar(good);
    expect(errors).toEqual([]);
    const { manifest } = buildManifest(base, files, 1, sidecar);
    expect(manifest.continuous).toEqual(good.continuous);
    expect(manifest.labels).toEqual(good.labels);
    expect(manifest.doorLeaf).toEqual(good.doorLeaf);
  });

  it("leaves the fields off without a sidecar, and never inherits them from the base", () => {
    const inherited = { ...base, continuous: { floor: 8 }, labels: { wallDecal: ["Old"] }, doorLeaf: { hingeX: 0, hingeY: 0, openDegrees: 1 } };
    const { manifest } = buildManifest(inherited, files, 1);
    expect(manifest).not.toHaveProperty("continuous");
    expect(manifest).not.toHaveProperty("labels");
    expect(manifest).not.toHaveProperty("doorLeaf");
  });

  it("accepts a partial sidecar", () => {
    expect(parsePackSidecar({ doorLeaf: good.doorLeaf })).toEqual({ sidecar: { doorLeaf: good.doorLeaf }, errors: [] });
  });

  it.each([
    ["a non-object", [], /must be a JSON object/],
    ["an unknown key", { door: {} }, /unknown key "door"/],
    ["a non-category period", { continuous: { lavaFall: 2 } }, /not a schema category/],
    ["a zero period", { continuous: { floor: 0 } }, /positive integer/],
    ["a fractional period", { continuous: { floor: 2.5 } }, /positive integer/],
    ["labels that are not strings", { labels: { wallDecal: ["ok", ""] } }, /non-empty strings/],
    ["labels that are not an array", { labels: { wallDecal: "Rat hole" } }, /non-empty strings/],
    ["a hinge outside the tile", { doorLeaf: { hingeX: 1.5, hingeY: 0.5, openDegrees: 80 } }, /hingeX/],
    ["a door that does not swing", { doorLeaf: { hingeX: 0.25, hingeY: 0.5, openDegrees: 0 } }, /openDegrees/],
    ["a door swinging past 180", { doorLeaf: { hingeX: 0.25, hingeY: 0.5, openDegrees: 181 } }, /openDegrees/],
  ])("refuses %s", (_name, raw, message) => {
    const { sidecar, errors } = parsePackSidecar(raw);
    expect(errors.join(" ")).toMatch(message);
    expect(sidecar).toEqual({});
  });
});
