import { describe, expect, it } from "vitest";
import { emptyLayers, type DungeonMapLayers } from "@/types/dungeonMap.types";
import { drawMapContent } from "./drawMap";
import { applyGroundStroke, paintGroundCells } from "./groundRegions";
import { makeCtx, makeRuntime, sourceOf } from "./testCanvas";

const SAND = { pack_id: "sand", pack_version: 1, variant: 0 };
const WATER = { pack_id: "water", pack_version: 1, variant: 0 };
function draw(layers: DungeonMapLayers, available = true) {
  const { ctx, rec } = makeCtx();
  drawMapContent({ ctx, tilePx: 128, origin: { x: 0, y: 0 }, bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 }, layers,
    runtime: (pack) => available ? makeRuntime(pack, { variantCount: 10 }) : null, defaultPackId: "sand", glyphs: {}, glyphPackId: "sand", dressing: new Map(), lights: false, pass: "ground" });
  return rec;
}

describe("material vector clipping shared by editor and bake", () => {
  it("clips every source tile, including squares a smooth boundary crosses outside its projected cells", () => {
    let serial = 0;
    const layers = applyGroundStroke(emptyLayers(), [{ x: 2.2, y: 2.2, r: 1.6 }], { pack: SAND, wall: SAND, erase: false, newKey: () => `edge-${serial++}` });
    const rec = draw(layers);
    expect(rec.clipCount).toBe(1);
    expect(rec.drawImages.length).toBeGreaterThan(Object.keys(layers.floor).length);
    expect(rec.drawImages.every((tile) => tile.clips === 1)).toBe(true);
  });

  it("draws independent underpaint then water, each clipped to its own source", () => {
    const sand = paintGroundCells(emptyLayers(), new Set(["0,0", "1,0"]), SAND);
    const water = paintGroundCells(sand, new Set(["0,0"]), WATER, "terrainWater");
    const rec = draw(water);
    expect(rec.clipCount).toBe(2);
    expect(rec.drawImages.map((call) => sourceOf(call).category)).toEqual(["floor", "floor", "terrainWater"]);
    expect(rec.drawImages.every((tile) => tile.clips === 1)).toBe(true);
  });

  it("keeps per-square variants on one material surface", () => {
    const layers = paintGroundCells(emptyLayers(), new Set(["0,0", "1,0"]), SAND, "floor", "none", { variants: { "0,0": 3, "1,0": 7 } });
    expect(draw(layers).drawImages.map((call) => sourceOf(call).variant)).toEqual([3, 7]);
  });

  it("ignores stale projected cells when the authoritative source is empty", () => {
    const layers = emptyLayers();
    layers.floor["0,0"] = { floor: SAND };
    layers.terrain["0,0"] = WATER;
    expect(draw(layers).drawImages).toHaveLength(0);
  });

  it("does not clip or draw a source whose material runtime is absent", () => {
    const layers = paintGroundCells(emptyLayers(), new Set(["0,0"]), SAND);
    const rec = draw(layers, false);
    expect(rec.clipCount).toBe(0);
    expect(rec.drawImages).toHaveLength(0);
  });
});
