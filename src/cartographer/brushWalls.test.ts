import { describe, it, expect } from "vitest";
import { outlineToWalls, type BrushOptions } from "./brushWalls";
import { applyBrushStroke } from "./groundRegions";
import { deriveSpaces } from "./structure";
import { putWall } from "./testWalls";
import { readLayers } from "./areaToWalls";
import { collectOcclusion } from "./mapOcclusion";
import { emptyLayers, cellKey, type DungeonMapLayers, type PackRef } from "@/types/dungeonMap.types";
import type { Disc } from "./area";

const PACK: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };
const WALL = { type: "wall" as const, ...PACK };
let n = 0;
const opts = (over: Partial<BrushOptions> = {}): BrushOptions => ({ erase: false, pack: PACK, wall: PACK, newKey: () => `w${n++}`, ...over });
const WATER: PackRef = { pack_id: "water", pack_version: 2, variant: 4 };

/** A saved cell room is ingested once; its physical walls remain independent of its material source. */
function room(x0: number, y0: number, x1: number, y1: number): DungeonMapLayers {
  const layers = emptyLayers();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) layers.floor[cellKey(x, y)] = { floor: PACK };
  for (let x = x0; x < x1; x++) {
    putWall(layers, x, y0, "N", WALL);
    putWall(layers, x, y1, "N", WALL);
  }
  for (let y = y0; y < y1; y++) {
    putWall(layers, x0, y, "W", WALL);
    putWall(layers, x1, y, "W", WALL);
  }
  const { ground: _ground, ...stored } = layers;
  return readLayers(stored, { newKey: () => `region${n++}` });
}
const topId = (layers: DungeonMapLayers): string => Object.entries(layers.ground).sort(([, a], [, b]) => b.z - a.z)[0][0];
const stroke = (...c: [number, number, number][]): { discs: Disc[] } => ({ discs: c.map(([x, y, r]) => ({ x, y, r })) });
/** Discs every 0.25 squares along a horizontal drag, as the editor lays them down. */
const drag = (x0: number, x1: number, y: number, r: number): { discs: Disc[] } =>
  stroke(...Array.from({ length: Math.round((x1 - x0) / 0.25) + 1 }, (_, i): [number, number, number] => [x0 + i * 0.25, y, r]));
const circle = (r: number, cx = 0, cy = 0, count = 200): [number, number][] =>
  Array.from({ length: count }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / count), cy + r * Math.sin((2 * Math.PI * i) / count)]);

describe("outlineToWalls", () => {
  it("a circle of radius 4 comes out as a closed run of 8-25 smooth nodes, not hundreds", () => {
    const walls = Object.values(outlineToWalls(circle(4), opts()));
    expect(walls.length).toBeGreaterThanOrEqual(8);
    expect(walls.length).toBeLessThanOrEqual(25);
    expect(walls.every((w) => w.smoothA && w.smoothB)).toBe(true);
    // closed: every end is some wall's start
    const starts = new Set(walls.map((w) => w.a.join()));
    expect(walls.every((w) => starts.has(w.b.join()))).toBe(true);
  });

  it("a square turns sharply, so its corners are not smooth", () => {
    const sq: [number, number][] = [[0, 0], [3, 0], [3, 3], [0, 3]];
    const walls = Object.values(outlineToWalls(sq, opts()));
    expect(walls).toHaveLength(4);
    expect(walls.some((w) => w.smoothA || w.smoothB)).toBe(false);
  });
});

describe("applyBrushStroke", () => {
  it("starts a separate smooth floor-only shape by default", () => {
    const next = applyBrushStroke(emptyLayers(), stroke([10, 10, 3]), opts());
    expect(Object.keys(next.ground)).toHaveLength(1);
    const region = next.ground[topId(next)];
    const edges = Object.values(region.boundary);
    expect(edges.length).toBeGreaterThanOrEqual(8);
    expect(edges.length).toBeLessThanOrEqual(25);
    expect(edges.every((edge) => edge.smoothA && edge.smoothB)).toBe(true);
    expect(next.walls).toEqual({});
    expect(region.walls.mode).toBe("none");
    expect(next.floor[cellKey(10, 10)]?.floor).toEqual(PACK);
    expect(next.floor[cellKey(10, 14)]).toBeUndefined();
  });

  it("paints a water oasis inside an existing desert without creating a wall or dungeon room", () => {
    const sand = room(0, 0, 10, 10);
    const sandId = topId(sand);
    const water = applyBrushStroke(sand, stroke([5, 5, 2]), opts({ pack: WATER, category: "terrainWater" }));
    expect(Object.keys(water.ground)).toHaveLength(2);
    expect(water.ground[sandId]).toBe(sand.ground[sandId]);
    expect(water.walls).toBe(sand.walls);
    expect(water.floor[cellKey(5, 5)]?.floor).toEqual(PACK);
    expect(water.terrain[cellKey(5, 5)]).toEqual(WATER);
    expect(water.terrain[cellKey(1, 1)]).toBeUndefined();
    expect(deriveSpaces(water)).toHaveLength(1);
    expect(collectOcclusion(water, 0, 0)).toEqual(collectOcclusion(sand, 0, 0));
  });

  it("New shape does not merge an overlapping shape even when both use the same material", () => {
    const first = applyBrushStroke(emptyLayers(), stroke([2, 2, 2]), opts());
    const id = topId(first);
    const second = applyBrushStroke(first, stroke([3, 2, 2]), opts());
    expect(Object.keys(second.ground)).toHaveLength(2);
    expect(second.ground[id]).toBe(first.ground[id]);
    expect(second.ground[topId(second)].z).toBeGreaterThan(first.ground[id].z);
    expect(second.walls).toBe(first.walls);
  });

  it("Extend changes only the explicitly selected source and retains its material", () => {
    const sand = room(0, 0, 8, 8);
    const sandId = topId(sand);
    const water = applyBrushStroke(sand, stroke([3, 3, 1.5]), opts({ pack: WATER }));
    const waterId = topId(water);
    const next = applyBrushStroke(water, drag(3, 6, 3, 1), opts({ mode: "extend", targetId: waterId }));
    expect(Object.keys(next.ground)).toHaveLength(2);
    expect(next.ground[sandId]).toBe(sand.ground[sandId]);
    expect(next.ground[waterId].material).toEqual(WATER);
    expect(next.floor[cellKey(6, 3)]?.floor).toEqual(WATER);
    expect(next.walls).toBe(sand.walls);
  });

  it("Extend and Alt require a valid target rather than choosing the shape under the pointer", () => {
    const layers = room(0, 0, 5, 5);
    const disc = stroke([2.5, 2.5, 1]);
    expect(applyBrushStroke(layers, disc, opts({ mode: "extend" }))).toBe(layers);
    expect(applyBrushStroke(layers, disc, opts({ erase: true }))).toBe(layers);
    expect(applyBrushStroke(layers, disc, opts({ mode: "extend", targetId: "missing" }))).toBe(layers);
    expect(applyBrushStroke(layers, disc, opts({ erase: true, targetId: "missing" }))).toBe(layers);
  });

  it("Alt subtracts only the selected overlay and reveals the untouched sand beneath it", () => {
    const sand = room(0, 0, 8, 8);
    const sandId = topId(sand);
    const water = applyBrushStroke(sand, stroke([4, 4, 2]), opts({ pack: WATER, category: "terrainWater" }));
    const waterId = topId(water);
    const cut = applyBrushStroke(water, stroke([4.5, 4.5, 0.8]), opts({ erase: true, targetId: waterId }));
    expect(cut.terrain[cellKey(4, 4)]).toBeUndefined();
    expect(cut.floor[cellKey(4, 4)]?.floor).toEqual(PACK);
    expect(cut.ground[sandId]).toBe(sand.ground[sandId]);
    expect(cut.ground[waterId].material).toEqual(WATER);
    expect(cut.walls).toBe(sand.walls);
  });

  it.each(["visible", "hidden"] as const)("creates optional %s perimeter walls independently of material geometry", (walls) => {
    const next = applyBrushStroke(emptyLayers(), stroke([5, 5, 2]), opts({ walls, wall: WATER }));
    const region = next.ground[topId(next)];
    expect(region.walls.mode).toBe(walls);
    expect(region.walls.ids.length).toBeGreaterThan(0);
    expect(region.walls.ids.every((id) => next.walls[id].pack_id === WATER.pack_id)).toBe(true);
    expect(next.floor[cellKey(5, 5)]?.floor).toEqual(PACK);
    expect(region.walls.ids.every((id) => next.walls[id].visible === (walls === "hidden" ? false : undefined))).toBe(true);
    expect(collectOcclusion(next, 0, 0).walls.length).toBeGreaterThan(0);
  });

  it("floor-only overlay painting preserves all physical walls, their materials, and doors", () => {
    const layers = room(0, 0, 5, 5);
    putWall(layers, 0, 1, "N", { type: "doorClosed", ...WATER });
    putWall(layers, 2, 0, "N", { type: "wall", ...WATER });
    const next = applyBrushStroke(layers, stroke([2.5, 0.5, 1.4]), opts());
    expect(next.walls).toBe(layers.walls);
    expect(next.walls["0,1:N"].type).toBe("doorClosed");
    expect(next.walls["2,0:N"].pack_id).toBe("water");
  });

  it("an empty stroke leaves the layers unchanged", () => {
    const layers = room(0, 0, 5, 5);
    expect(applyBrushStroke(layers, stroke(), opts())).toBe(layers);
  });
});
