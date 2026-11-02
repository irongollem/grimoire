import { applyGroundStroke, paintGroundCells } from "./groundRegions";
import { describe, expect, it } from "vitest";
import { mapHasMotion } from "./motion";
import { cellKey, emptyLayers } from "@/types/dungeonMap.types";
import type { DressingCatalog, DressingProp } from "./dressing";
import type { MotionOverlay } from "@/types/mapLive.types";
import { makeRuntime } from "./testCanvas";

const FOAM: MotionOverlay = { url: "https://cdn/foam.webp", cells: 4, drift: [0.1, 0], alpha: 0.5 };
const ref = (pack_id: string) => ({ pack_id, pack_version: 1, variant: 0 });
const NONE: DressingCatalog = new Map();

describe("vector water motion", () => {
  it("offers motion for a water vector smaller than one projected square", () => {
    let serial = 0;
    const layers = applyGroundStroke(emptyLayers(), [{ x: 0.2, y: 0.2, r: 0.15 }], {
      pack: { pack_id: "sea", pack_version: 1, variant: 0 }, wall: { pack_id: "sea", pack_version: 1, variant: 0 },
      category: "terrainWater", erase: false, newKey: () => `water-${serial++}`,
    });
    const rt = makeRuntime("sea", { motion: { terrainWater: [{ url: "wave.webp", cells: 2, drift: [0.1, 0], alpha: 0.5 }] } });
    expect(Object.keys(layers.terrain)).toHaveLength(0);
    expect(mapHasMotion(layers, new Map([["sea", rt]]), new Map())).toBe(true);
  });
});

describe("mapHasMotion", () => {
  it("offers no Motion button for a map with no water, sway or firelight", () => {
    const layers = emptyLayers();
    layers.terrain[cellKey(0, 0)] = ref("plain");
    layers.object[cellKey(1, 1)] = { ...ref("plain"), category: "objectPillar", variant: 0 };
    expect(mapHasMotion(layers, new Map([["plain", makeRuntime("plain")]]), NONE)).toBe(false);
  });

  it("counts painted water only when its pack animates water", () => {
    const layers = paintGroundCells(emptyLayers(), new Set(["0,0"]), ref("sea"), "terrainWater");
    expect(mapHasMotion(layers, new Map([["sea", makeRuntime("sea", { motion: { terrainWater: [FOAM] } })]]), NONE)).toBe(true);
    expect(mapHasMotion(layers, new Map([["sea", makeRuntime("sea")]]), NONE)).toBe(false);
  });

  it("counts the open mass outside the map when its pack animates it", () => {
    const layers = emptyLayers();
    layers.solidBlock[cellKey(0, 0)] = ref("sea");
    expect(mapHasMotion(layers, new Map([["sea", makeRuntime("sea", { motion: { solidBlock: [FOAM] } })]]), NONE)).toBe(true);
  });

  it("counts a swaying tree, but not one whose art has no url to draw it from", () => {
    const layers = emptyLayers();
    layers.object[cellKey(1, 1)] = { ...ref("grove"), category: "objectPillar", variant: 0 };
    const sway = { objectPillar: [{ amount: 3, speed: 1 }] };
    const withArt = makeRuntime("grove", { sway, assets: { objectPillar: [{ variant: 0, url: "https://cdn/tree.webp" }] } });
    expect(mapHasMotion(layers, new Map([["grove", withArt]]), NONE)).toBe(true);
    expect(mapHasMotion(layers, new Map([["grove", makeRuntime("grove", { sway })]]), NONE)).toBe(false);
  });

  it("counts a swaying Dressing prop, not a still one", () => {
    const layers = emptyLayers();
    layers.dressing["p1"] = { prop_id: "palm", x: 1, y: 1, rotation: 0, z: 0 };
    const palm: DressingProp = { id: "palm", name: "Palm", footprint_w: 1, footprint_h: 1, image: null, flat: false, light: null, url: "https://cdn/palm.webp", sway: { amount: 3, speed: 1 } };
    expect(mapHasMotion(layers, new Map(), new Map([["palm", palm]]))).toBe(true);
    expect(mapHasMotion(layers, new Map(), new Map([["palm", { ...palm, sway: null }]]))).toBe(false);
  });

  it("counts a flickering torch and a fire-coloured light that declares nothing, not a steady cool one", () => {
    const layers = emptyLayers();
    layers.object[cellKey(2, 2)] = { ...ref("keep"), category: "objectBrazier", variant: 0 };
    const lit = (light: { color: string; bright: number; dim: number; flicker?: number }) =>
      new Map([["keep", makeRuntime("keep", { lights: { objectBrazier: [light] } })]]);
    const cool = { color: "#88aaff", bright: 20, dim: 20 };
    expect(mapHasMotion(layers, lit({ ...cool, flicker: 0.3 }), NONE)).toBe(true);
    // A brazier in a flame's colour needs no declaration (the maintainer, 2 Nov 2026: fire sources pulse).
    expect(mapHasMotion(layers, lit({ color: "#ff8030", bright: 20, dim: 20 }), NONE)).toBe(true);
    expect(mapHasMotion(layers, lit(cool), NONE)).toBe(false);
  });

});
