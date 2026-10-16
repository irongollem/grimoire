import { describe, it, expect } from "vitest";
import { buildMapLive } from "./mapLive";
import { cellKey, emptyLayers, type DungeonMap } from "@/types/dungeonMap.types";
import type { MotionOverlay } from "@/types/mapLive.types";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DressingCatalog } from "./dressing";
import { makeRuntime } from "./testCanvas";

const FOAM: MotionOverlay = { url: "https://cdn/foam.webp", cells: 4, drift: [0.1, 0], alpha: 0.5 };
const GLINT: MotionOverlay = { url: "https://cdn/glint.webp", cells: 2, drift: [0, 0], alpha: 0.4, breathe: { amount: 0.3, speed: 2, phase: 0 } };
const ref = (pack_id: string) => ({ pack_id, pack_version: 1, variant: 0 });

function mapWith(layers: DungeonMap["layers"]): DungeonMap {
  return { id: "m", layers } as unknown as DungeonMap;
}

function runtimes(entries: [string, TilePackRuntime][]): Map<string, TilePackRuntime> {
  return new Map(entries);
}

const NO_DRESSING: DressingCatalog = new Map();

describe("buildMapLive", () => {
  it("groups terrain by pack as water, in image cells, with the pack's terrainWater overlays", () => {
    const layers = emptyLayers();
    layers.terrain[cellKey(2, 3)] = ref("sea");
    layers.terrain[cellKey(3, 3)] = ref("sea");
    layers.terrain[cellKey(2, 4)] = ref("lava");
    const live = buildMapLive(
      mapWith(layers),
      runtimes([["sea", makeRuntime("sea", { motion: { terrainWater: [FOAM] } })], ["lava", makeRuntime("lava")]]),
      NO_DRESSING,
      1,
      2,
    );
    const sea = live.groups.find((g) => g.cells.includes("1,1"));
    expect(sea).toEqual({ kind: "water", cells: ["1,1", "2,1"], overlays: [FOAM] });
    // Water without motion still makes a group: later stories read its cells.
    expect(live.groups.find((g) => g.cells.includes("1,2"))).toEqual({ kind: "water", cells: ["1,2"], overlays: [] });
  });

  it("makes an outer group only for a pack whose solidBlock has overlays", () => {
    const layers = emptyLayers();
    layers.solidBlock[cellKey(0, 0)] = ref("sea");
    layers.solidBlock[cellKey(1, 0)] = ref("rock");
    const live = buildMapLive(
      mapWith(layers),
      runtimes([["sea", makeRuntime("sea", { motion: { solidBlock: [GLINT] } })], ["rock", makeRuntime("rock")]]),
      NO_DRESSING,
      0,
      0,
    );
    expect(live.groups).toEqual([{ kind: "outer", cells: ["0,0"], overlays: [GLINT] }]);
  });

  it("converts light sources to image cells", () => {
    const layers = emptyLayers();
    layers.object[cellKey(5, 5)] = { ...ref("p"), category: "objectBrazier", variant: 1 };
    const fire = { color: "#ff8030", bright: 20, dim: 20, intensity: 0.6 };
    const live = buildMapLive(
      mapWith(layers),
      runtimes([["p", makeRuntime("p", { lights: { objectBrazier: [null, fire] } })]]),
      NO_DRESSING,
      3,
      4,
    );
    expect(live.lights).toEqual([{ x: 2.5, y: 1.5, color: "#ff8030", bright: 20, dim: 20, intensity: 0.6 }]);
    expect(live.version).toBe(1);
  });

  it("is JSON-safe", () => {
    const live = buildMapLive(mapWith(emptyLayers()), new Map(), NO_DRESSING, 0, 0);
    expect(JSON.parse(JSON.stringify(live))).toEqual(live);
  });
});
