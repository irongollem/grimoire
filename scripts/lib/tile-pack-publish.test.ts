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
    lights: { objectBrazier: [{ color: "#ffb347", bright: 20, dim: 20, intensity: 0.7 }, null, { color: "#44aaff", bright: 0, dim: 10, pulse: 0.4 }, { color: "#ff6020", bright: 20, dim: 10, flicker: 0.25 }] },
    sway: { objectPillar: [{ amount: 3, speed: 1.2 }, null, { amount: 8, speed: 4 }] },
    flush: ["curbH", "curbV", "curbPost"],
    motion: {
      terrainWater: [{ url: "motion/foam.webp", cells: 4, drift: [0.1, -0.05], alpha: 0.5, breathe: { amount: 0.3, speed: 2, phase: 1 } }],
      solidBlock: [{ url: "motion/glint.webp", cells: 2, drift: [0, 0], alpha: 0.4 }],
    },
  };
  const motionFiles = [{ relative: "motion/foam.webp", byteSize: 10 }, { relative: "motion/glint.webp", byteSize: 10 }];

  it("copies a valid sidecar into the manifest", () => {
    const { sidecar, errors } = parsePackSidecar(good);
    expect(errors).toEqual([]);
    const { manifest } = buildManifest(base, files, 1, sidecar);
    expect(manifest.continuous).toEqual(good.continuous);
    expect(manifest.labels).toEqual(good.labels);
    expect(manifest.doorLeaf).toEqual(good.doorLeaf);
    expect(manifest.lights).toEqual(good.lights);
    expect(manifest.flush).toEqual(good.flush);
    expect(manifest.sway).toEqual(good.sway);
  });

  it("copies motion into the manifest when its files are in the folder, without calling them slots", () => {
    const { sidecar } = parsePackSidecar(good);
    const { manifest, errors } = buildManifest(base, [...files, ...motionFiles], 1, sidecar);
    expect(errors).toEqual([]);
    expect(manifest.motion).toEqual(good.motion);
    expect(Object.keys(manifest.assets)).not.toContain("motion");
  });

  it("refuses a motion overlay whose file is missing from the folder", () => {
    const { sidecar } = parsePackSidecar(good);
    const { errors } = buildManifest(base, files, 1, sidecar);
    expect(errors.join(" ")).toMatch(/motion\/foam.webp, which is not in the folder/);
  });

  it("refuses a motion file that is not motion/<name>.webp", () => {
    const { errors } = buildManifest(base, [...files, { relative: "motion/Foam 1.webp", byteSize: 1 }], 1);
    expect(errors.join(" ")).toMatch(/motion files must be/);
  });

  it("leaves the fields off without a sidecar, and never inherits them from the base", () => {
    const inherited = { ...base, continuous: { floor: 8 }, labels: { wallDecal: ["Old"] }, doorLeaf: { hingeX: 0, hingeY: 0, openDegrees: 1 }, lights: { objectBrazier: [{ color: "#ffffff", bright: 5, dim: 5 }] } };
    const { manifest } = buildManifest(inherited, files, 1);
    expect(manifest).not.toHaveProperty("continuous");
    expect(manifest).not.toHaveProperty("labels");
    expect(manifest).not.toHaveProperty("doorLeaf");
    expect(manifest).not.toHaveProperty("lights");
  });

  it("accepts a partial sidecar", () => {
    expect(parsePackSidecar({ doorLeaf: good.doorLeaf })).toEqual({ sidecar: { doorLeaf: good.doorLeaf }, errors: [] });
  });

  it.each([
    ["a non-object", [], /must be a JSON object/],
    ["an unknown key", { door: {} }, /unknown key "door"/],
    ["flush that is not a list of categories", { flush: ["curbH", "surf"] }, /flush must be an array of schema categories/],
    ["a non-category period", { continuous: { lavaFall: 2 } }, /not a schema category/],
    ["a zero period", { continuous: { floor: 0 } }, /positive integer/],
    ["a fractional period", { continuous: { floor: 2.5 } }, /positive integer/],
    ["labels that are not strings", { labels: { wallDecal: ["ok", ""] } }, /non-empty strings/],
    ["labels that are not an array", { labels: { wallDecal: "Rat hole" } }, /non-empty strings/],
    ["a hinge outside the tile", { doorLeaf: { hingeX: 1.5, hingeY: 0.5, openDegrees: 80 } }, /hingeX/],
    ["a door that does not swing", { doorLeaf: { hingeX: 0.25, hingeY: 0.5, openDegrees: 0 } }, /openDegrees/],
    ["a door swinging past 180", { doorLeaf: { hingeX: 0.25, hingeY: 0.5, openDegrees: 181 } }, /openDegrees/],
    ["lights that are not an object", { lights: [] }, /lights must be an object/],
    ["lights for a non-category", { lights: { lavaFall: [null] } }, /lights.lavaFall is not a schema category/],
    ["lights that are not an array", { lights: { objectBrazier: { color: "#ffffff", bright: 20, dim: 20 } } }, /must be an array/],
    ["a light that is not an object", { lights: { objectBrazier: ["#ffffff"] } }, /lights.objectBrazier\[0\]/],
    ["a colour that is not #rrggbb", { lights: { objectBrazier: [{ color: "#FFF", bright: 20, dim: 20 }] } }, /lights.objectBrazier\[0\]/],
    ["an upper-case colour", { lights: { objectBrazier: [{ color: "#FFAA00", bright: 20, dim: 20 }] } }, /lights.objectBrazier\[0\]/],
    ["neither bright nor dim light", { lights: { objectBrazier: [{ color: "#ffffff", bright: 0, dim: 0 }] } }, /lights.objectBrazier\[0\]/],
    ["a light without its dim feet", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20 }] } }, /lights.objectBrazier\[0\]/],
    ["a light in cells (the old range)", { lights: { objectBrazier: [{ color: "#ffffff", range: 2 }] } }, /lights.objectBrazier\[0\]/],
    ["bright light past sixty feet", { lights: { objectBrazier: [null, { color: "#ffffff", bright: 65, dim: 0 }] } }, /lights.objectBrazier\[1\]/],
    ["negative dim feet", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: -5 }] } }, /lights.objectBrazier\[0\]/],
    ["an intensity of zero", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: 20, intensity: 0 }] } }, /lights.objectBrazier\[0\]/],
    ["an intensity above 1", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: 20, intensity: 1.2 }] } }, /lights.objectBrazier\[0\]/],
    ["motion that is not an object", { motion: [] }, /motion must be an object/],
    ["motion for another surface", { motion: { lava: [] } }, /motion.lava is not terrainWater or solidBlock/],
    ["motion that is not an array", { motion: { terrainWater: {} } }, /motion.terrainWater must be an array/],
    ["an overlay url outside motion/", { motion: { terrainWater: [{ url: "foam.webp", cells: 4, drift: [0, 0], alpha: 0.5 }] } }, /motion.terrainWater\[0\]/],
    ["an overlay url with capitals", { motion: { terrainWater: [{ url: "motion/Foam.webp", cells: 4, drift: [0, 0], alpha: 0.5 }] } }, /motion.terrainWater\[0\]/],
    ["overlay cells past 16", { motion: { terrainWater: [{ url: "motion/a.webp", cells: 17, drift: [0, 0], alpha: 0.5 }] } }, /motion.terrainWater\[0\]/],
    ["overlay drift past 5", { motion: { terrainWater: [{ url: "motion/a.webp", cells: 4, drift: [6, 0], alpha: 0.5 }] } }, /motion.terrainWater\[0\]/],
    ["an overlay drift of one number", { motion: { terrainWater: [{ url: "motion/a.webp", cells: 4, drift: [1], alpha: 0.5 }] } }, /motion.terrainWater\[0\]/],
    ["overlay alpha above 1", { motion: { terrainWater: [{ url: "motion/a.webp", cells: 4, drift: [0, 0], alpha: 1.5 }] } }, /motion.terrainWater\[0\]/],
    ["a breathe speed past 10", { motion: { terrainWater: [{ url: "motion/a.webp", cells: 4, drift: [0, 0], alpha: 0.5, breathe: { amount: 0.2, speed: 11, phase: 0 } }] } }, /motion.terrainWater\[0\]/],
    ["an overlay with another key", { motion: { terrainWater: [{ url: "motion/a.webp", cells: 4, drift: [0, 0], alpha: 0.5, blend: "add" }] } }, /motion.terrainWater\[0\]/],
    ["flicker and pulse together", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: 20, flicker: 0.2, pulse: 0.2 }] } }, /lights.objectBrazier\[0\]/],
    ["a flicker of zero", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: 20, flicker: 0 }] } }, /lights.objectBrazier\[0\]/],
    ["a pulse above 1", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: 20, pulse: 1.5 }] } }, /lights.objectBrazier\[0\]/],
    ["sway that is not an object", { sway: [] }, /sway must be an object/],
    ["sway for a non-category", { sway: { lavaFall: [null] } }, /sway.lavaFall is not a schema category/],
    ["sway for a floor", { sway: { floor: [{ amount: 3, speed: 1 }] } }, /sway.floor does not draw as a standing object/],
    ["sway for a flat category", { sway: { rubble: [{ amount: 3, speed: 1 }] } }, /sway.rubble does not draw as a standing object/],
    ["sway for stairs", { sway: { stairsUp: [{ amount: 3, speed: 1 }] } }, /sway.stairsUp does not draw as a standing object/],
    ["sway that is not an array", { sway: { objectPillar: { amount: 3, speed: 1 } } }, /must be an array/],
    ["a sway amount past 8 degrees", { sway: { objectPillar: [{ amount: 9, speed: 1 }] } }, /sway.objectPillar\[0\]/],
    ["a sway amount of zero", { sway: { objectPillar: [{ amount: 0, speed: 1 }] } }, /sway.objectPillar\[0\]/],
    ["a sway speed past 4", { sway: { objectPillar: [null, { amount: 3, speed: 5 }] } }, /sway.objectPillar\[1\]/],
    ["a sway with another key", { sway: { objectPillar: [{ amount: 3, speed: 1, phase: 0 }] } }, /sway.objectPillar\[0\]/],
    ["a light with another key", { lights: { objectBrazier: [{ color: "#ffffff", bright: 20, dim: 20, flicker: true }] } }, /lights.objectBrazier\[0\]/],
  ])("refuses %s", (_name, raw, message) => {
    const { sidecar, errors } = parsePackSidecar(raw);
    expect(errors.join(" ")).toMatch(message);
    expect(sidecar).toEqual({});
  });
});
