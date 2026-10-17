import { describe, it, expect } from "vitest";
import { drawMapContent } from "./drawMap";
import { applyDisc } from "./area";
import { collectOcclusion } from "./mapOcclusion";
import { cachedAreaLoops } from "./drawArea";
import type { DrawMapInput } from "./drawFrame";
import { emptyLayers, cellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import { makeCtx, makeRuntime, sourceOf, type Recorder } from "./testCanvas";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";

const PACK = "p";
const ref = { pack_id: PACK, pack_version: 1, variant: 0 };

function brushed(): DungeonMapLayers {
  return applyDisc(emptyLayers(), { x: 3.5, y: 3.5, r: 1.2 }, ref, "paint");
}

function draw(layers: DungeonMapLayers, rt: TilePackRuntime, pass: DrawMapInput["pass"] = "all"): Recorder {
  const { ctx, rec } = makeCtx();
  drawMapContent({
    ctx,
    tilePx: BASE_TILE_SIZE,
    origin: { x: 0, y: 0 },
    bounds: { minX: 0, minY: 0, maxX: 7, maxY: 7 },
    layers,
    runtime: () => rt,
    defaultPackId: PACK,
    glyphs: {},
    glyphPackId: PACK,
    dressing: new Map(),
    lights: false,
    pass,
  });
  return rec;
}

describe("brushed area ground", () => {
  it("draws an area cell's floor inside a clip, not as a bare square", () => {
    const layers = brushed();
    const rec = draw(layers, makeRuntime(PACK, { categoryCounts: { floor: 1 } }), "ground");
    const floors = rec.drawImages.filter((d) => sourceOf(d).category === "floor");
    expect(floors.length).toBe(Object.keys(layers.area).length);
    expect(rec.clipCount).toBe(1);
    expect(floors.every((d) => d.clips === 1)).toBe(true);
  });

  it("keeps plain floor cells as unclipped squares", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    const rec = draw(layers, makeRuntime(PACK, { categoryCounts: { floor: 1 } }), "ground");
    expect(rec.clipCount).toBe(0);
    expect(rec.drawImages.filter((d) => sourceOf(d).category === "floor")).toHaveLength(1);
  });

  it("draws a partial cell that has no floor entry", () => {
    const layers = applyDisc(emptyLayers(), { x: 3.5, y: 3.5, r: 0.2 }, ref, "paint");
    expect(Object.keys(layers.floor)).toHaveLength(0);
    const rec = draw(layers, makeRuntime(PACK, { categoryCounts: { floor: 1 } }), "ground");
    expect(rec.drawImages.filter((d) => sourceOf(d).category === "floor").length).toBeGreaterThan(0);
  });
});

describe("brushed area wall ribbon", () => {
  const art = makeRuntime(PACK, { categoryCounts: { floor: 1, wallSegmentH: 1 } });

  it("draws slices along the loop with the source offset running on", () => {
    const layers = brushed();
    const loops = cachedAreaLoops(layers);
    expect(loops).toHaveLength(1);
    const loop = loops[0];
    const rec = draw(layers, art, "standing");
    const slices = rec.drawImages.filter((d) => d.src !== undefined && sourceOf(d).category === "wallSegmentH");
    expect(slices.length).toBeGreaterThanOrEqual(loop.points.length);
    // tilePx equals the base tile size, so one drawn pixel is one source pixel: the first slice of each segment
    // starts where the loop length so far says.
    let travelled = 0;
    let k = 0;
    const n = loop.points.length;
    for (let i = 0; i < n; i++) {
      const a = loop.points[i];
      const b = loop.points[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * BASE_TILE_SIZE;
      if (loop.stroke[i]) {
        while (slices[k].x > 0) k++; // skip the wrapped continuation slices of the previous segment
        expect(slices[k].src?.x).toBeCloseTo(travelled % BASE_TILE_SIZE, 5);
        k++;
      }
      travelled += len;
    }
    expect(rec.rotates.length).toBeGreaterThan(0);
  });

  it("draws nothing for a loop whose segments carry no wall", () => {
    const layers = brushed();
    const loops = cachedAreaLoops(layers);
    loops[0].stroke.fill(false);
    const rec = draw(layers, art, "standing");
    expect(rec.drawImages.filter((d) => sourceOf(d).category === "wallSegmentH")).toHaveLength(0);
    expect(rec.calls).not.toContain("stroke");
  });

  it("strokes in the palette's wall colour when the pack has no wall art", () => {
    const rec = draw(brushed(), makeRuntime(PACK, { categoryCounts: { floor: 1 }, palette: { wallSegmentH: [1, 2, 3] } }), "standing");
    expect(rec.strokeStyles).toContain("rgb(1,2,3)");
    expect(rec.calls).toContain("stroke");
  });

  it("is cached per area record and floor identity", () => {
    const layers = brushed();
    expect(cachedAreaLoops(layers)).toBe(cachedAreaLoops(layers));
    expect(cachedAreaLoops({ ...layers, floor: { ...layers.floor } })).not.toBe(cachedAreaLoops(layers));
  });
});

describe("brushed area light and sight", () => {
  it("adds the area's edges to the walls, shifted by the origin", () => {
    const layers = brushed();
    const plain = collectOcclusion(emptyLayers(), 0, 0).walls;
    expect(plain).toHaveLength(0);
    const walls = collectOcclusion(layers, 0, 0).walls;
    expect(walls.length).toBeGreaterThan(0);
    const shifted = collectOcclusion(layers, 2, 1).walls;
    expect(shifted).toHaveLength(walls.length);
    expect(walls).toContain("3,2:N");
    expect(shifted).toContain("1,1:N");
  });
});
