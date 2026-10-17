import { describe, it, expect } from "vitest";
import { buildMapLive } from "./mapLive";
import { cellKey, emptyLayers, type DungeonMap } from "@/types/dungeonMap.types";
import type { MotionOverlay } from "@/types/mapLive.types";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DressingCatalog, DressingProp } from "./dressing";
import { makeRuntime } from "./testCanvas";
import { phaseAt } from "./sway";

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
  it("carries the map's darkness level", () => {
    for (const darkness of ["daylight", "dim", "dark"] as const) {
      const map = { ...mapWith(emptyLayers()), darkness };
      expect(buildMapLive(map, runtimes([]), NO_DRESSING, 0, 0).darkness).toBe(darkness);
    }
  });

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
    expect(live.lights).toEqual([{ x: 2.5, y: 1.5, color: "#ff8030", bright: 20, dim: 20, intensity: 0.6, phase: phaseAt(2.5, 1.5) }]);
    expect(live.version).toBe(1);
  });

  it("carries a light's flicker or pulse, and only when set", () => {
    const layers = emptyLayers();
    layers.object[cellKey(0, 0)] = { ...ref("p"), category: "objectBrazier", variant: 0 };
    layers.object[cellKey(1, 0)] = { ...ref("p"), category: "objectBrazier", variant: 1 };
    layers.object[cellKey(2, 0)] = { ...ref("p"), category: "objectBrazier", variant: 2 };
    const live = buildMapLive(
      mapWith(layers),
      runtimes([[
        "p",
        makeRuntime("p", {
          lights: {
            objectBrazier: [
              { color: "#ff8030", bright: 20, dim: 20, flicker: 0.3 },
              { color: "#30ff80", bright: 0, dim: 10, pulse: 0.5 },
              { color: "#ffffff", bright: 5, dim: 5 },
            ],
          },
        }),
      ]]),
      NO_DRESSING,
      0,
      0,
    );
    expect(live.lights[0]).toMatchObject({ flicker: 0.3 });
    expect(live.lights[0]).not.toHaveProperty("pulse");
    expect(live.lights[1]).toMatchObject({ pulse: 0.5 });
    expect(live.lights[2]).not.toHaveProperty("flicker");
    expect(live.lights[0].phase).not.toBe(live.lights[1].phase);
  });

  it("lists swaying objects row-major, then swaying Dressing by z, in image cells", () => {
    const layers = emptyLayers();
    const sway = { amount: 3, speed: 1 };
    layers.object[cellKey(4, 6)] = { ...ref("p"), category: "objectPillar", variant: 0, rotation: 90 };
    layers.object[cellKey(2, 5)] = { ...ref("p"), category: "objectPillar", variant: 0 };
    layers.object[cellKey(3, 5)] = { ...ref("p"), category: "objectPillar", variant: 1 }; // still
    layers.dressing.a = { prop_id: "palm", x: 5, y: 5, rotation: 0, z: 1 };
    layers.dressing.b = { prop_id: "rock", x: 6, y: 6, rotation: 0, z: 0 };
    const palm: DressingProp = { id: "palm", name: "Palm", footprint_w: 2, footprint_h: 1, image: null, flat: false, light: null, url: "https://cdn/palm.webp", sway };
    const rock: DressingProp = { ...palm, id: "rock", sway: null };
    const live = buildMapLive(
      mapWith(layers),
      runtimes([["p", makeRuntime("p", {
        sway: { objectPillar: [sway, null] },
        assets: { objectPillar: [{ variant: 0, url: "https://cdn/tree.webp" }, { variant: 1, url: "https://cdn/stump.webp" }] },
      })]]),
      new Map([["palm", palm], ["rock", rock]]),
      1,
      2,
    );
    expect(live.sprites.map((s) => [s.url, s.x, s.y, s.w, s.h, s.rotation])).toEqual([
      ["https://cdn/tree.webp", 1.5, 3.5, 1, 1, 0],
      ["https://cdn/tree.webp", 3.5, 4.5, 1, 1, 90],
      ["https://cdn/palm.webp", 5, 3.5, 2, 1, 0],
    ]);
    expect(live.sprites[0].sway).toEqual({ ...sway, phase: phaseAt(1.5, 3.5) });
  });

  it("has no sprites when nothing sways", () => {
    expect(buildMapLive(mapWith(emptyLayers()), new Map(), NO_DRESSING, 0, 0).sprites).toEqual([]);
  });

  it("is JSON-safe", () => {
    const live = buildMapLive(mapWith(emptyLayers()), new Map(), NO_DRESSING, 0, 0);
    expect(JSON.parse(JSON.stringify(live))).toEqual(live);
  });

  it("lists what blocks light and sight in image cells: walls, sluices, doors by drawn state, solid rock, no grates", () => {
    const layers = emptyLayers();
    const seg = (type: "wall" | "doorClosed" | "doorOpen" | "grate" | "sluice") => ({ ...ref("p"), type });
    layers.floor[cellKey(3, 4)] = { wallN: seg("wall"), wallW: seg("doorClosed") };
    layers.floor[cellKey(4, 4)] = { wallN: seg("doorOpen"), wallW: seg("grate") };
    layers.floor[cellKey(5, 4)] = { wallN: seg("sluice") };
    layers.solidBlock[cellKey(9, 9)] = ref("rock");
    const live = buildMapLive(mapWith(layers), runtimes([]), NO_DRESSING, 1, 2);
    expect(live.walls.sort()).toEqual(["2,2:N", "4,2:N"]);
    expect(live.doors).toEqual([
      { edge: "2,2:W", open: false },
      { edge: "3,2:N", open: true },
    ]);
    expect(live.solid).toEqual(["8,7"]);
  });
});
