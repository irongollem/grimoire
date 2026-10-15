import { describe, it, expect } from "vitest";
import { chooseStyleImageSize, computeBakedDimensions, padToAspect, padToStyleAspect } from "./bake";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { DressingCatalog } from "./dressing";

const none: DressingCatalog = new Map();
const props: DressingCatalog = new Map([
  ["bed", { id: "bed", name: "Bed", footprint_w: 2, footprint_h: 3, image: null, flat: false }],
  ["table", { id: "table", name: "Table", footprint_w: 2, footprint_h: 1, image: null, flat: false }],
]);

function emptyMap(): DungeonMap {
  return {
    id: "test",
    user_id: "u",
    campaign_id: null,
    name: "Test",
    description: null,
    layers: { floor: {}, solidBlock: {}, terrain: {}, object: {}, annotation: {}, dressing: {} },
    metadata: {},
    default_pack_id: null,
    tags: [],
    notes: null,
    created_at: "",
    rev: 1,
    updated_at: "",
  };
}

describe("computeBakedDimensions", () => {
  it("returns padding-only dimensions when the map is empty", () => {
    // No painted cells: bbox collapses to (0,0)→(0,0) = 1×1 cell, plus 3 cells
    // of padding on each side = 7×7.
    expect(computeBakedDimensions(emptyMap(), none)).toEqual({ cols: 7, rows: 7, originCellX: -3, originCellY: -3 });
  });

  it("expands the bbox to include every painted layer", () => {
    const map = emptyMap();
    map.layers.floor["5,3"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.solidBlock["7,4"] = { pack_id: "p", pack_version: 1, variant: 0 };
    map.layers.object["2,6"] = { pack_id: "p", pack_version: 1, variant: 0, category: "objectChest" };
    // bbox (2,3)→(7,6) = 6 cols × 4 rows, plus 6 cells of padding total.
    expect(computeBakedDimensions(map, none)).toEqual({ cols: 12, rows: 10, originCellX: -1, originCellY: 0 });
  });

  it("handles negative coordinates (infinite-canvas origin)", () => {
    const map = emptyMap();
    map.layers.floor["-2,-3"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.floor["1,2"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    // bbox (-2,-3)→(1,2) = 4 cols × 6 rows + 6 cells of padding.
    expect(computeBakedDimensions(map, none)).toEqual({ cols: 10, rows: 12, originCellX: -5, originCellY: -6 });
  });

  it("respects a custom paddingCells argument", () => {
    const map = emptyMap();
    map.layers.floor["0,0"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    expect(computeBakedDimensions(map, none, 0)).toEqual({ cols: 1, rows: 1, originCellX: 0, originCellY: 0 });
    expect(computeBakedDimensions(map, none, 5)).toEqual({ cols: 11, rows: 11, originCellX: -5, originCellY: -5 });
  });
});

describe("computeBakedDimensions with Dressing (#1062)", () => {
  it("grows the extent for a multi-cell prop, not just its anchor", () => {
    const map = emptyMap();
    map.layers.floor["0,0"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    map.layers.dressing.a = { prop_id: "bed", x: 0, y: 0, rotation: 0, z: 0 };
    // bed covers x 0..1, y 0..2
    expect(computeBakedDimensions(map, props, 0)).toEqual({ cols: 2, rows: 3, originCellX: 0, originCellY: 0 });
  });

  it("grows for the rotated footprint", () => {
    const map = emptyMap();
    map.layers.dressing.a = { prop_id: "table", x: 3, y: 4, rotation: 90, z: 0 };
    // a quarter turn stands the 2x1 table 1x2 on its anchor: cell x 3, cells y 4..5
    expect(computeBakedDimensions(map, props, 0)).toEqual({ cols: 1, rows: 2, originCellX: 3, originCellY: 4 });
    // at 45 degrees (centre 3.5, 5) the corners reach 1.06 cells out each way:
    // x 2.44..4.56, y 3.94..6.06, and every cell they touch counts
    map.layers.dressing.a = { prop_id: "table", x: 3, y: 4, rotation: 45, z: 0 };
    expect(computeBakedDimensions(map, props, 0)).toEqual({ cols: 3, rows: 4, originCellX: 2, originCellY: 3 });
  });

  it("lets a placement alone set the extent", () => {
    const map = emptyMap();
    map.layers.dressing.a = { prop_id: "table", x: 10, y: 10, rotation: 0, z: 0 };
    expect(computeBakedDimensions(map, props, 0)).toEqual({ cols: 2, rows: 1, originCellX: 10, originCellY: 10 });
  });

  it("counts a prop missing from the catalog as 1x1", () => {
    const map = emptyMap();
    map.layers.dressing.a = { prop_id: "gone", x: 2, y: 2, rotation: 0, z: 0 };
    expect(computeBakedDimensions(map, none, 0)).toEqual({ cols: 1, rows: 1, originCellX: 2, originCellY: 2 });
  });
});

describe("padToAspect", () => {
  // A square target (targetAspect=1) is the simplest case of this general
  // "pad to any target aspect" primitive.
  it("is a no-op (zero offset, unchanged cell count) when the content already has the target aspect", () => {
    const g = padToAspect(1000, 1000, 20, 1);
    expect(g).toEqual({ effWidth: 1000, effHeight: 1000, offsetX: 0, offsetY: 0, cellsPerImageWidth: 20, originXPct: 0, originYPct: 0 });
  });

  it("centers a wider-than-target render, padding top and bottom", () => {
    // 2000×1000, 20 cells across the 2000px width (100px/cell). Padded to a
    // 2000×2000 square: the content still starts at x=0 (already spans the
    // full width) but is centered vertically, 500px top and bottom.
    const g = padToAspect(2000, 1000, 20, 1);
    expect(g.effWidth).toBe(2000);
    expect(g.effHeight).toBe(2000);
    expect(g.offsetX).toBe(0);
    expect(g.offsetY).toBe(500);
    // The canvas is now wider relative to the unchanged 100px cell size:
    // 2000 / 100 = 20 cells across the width — unchanged, since padding this
    // axis added nothing (it was already the longer side).
    expect(g.cellsPerImageWidth).toBe(20);
    expect(g.originXPct).toBe(0);
    expect(g.originYPct).toBe(0.25);
  });

  it("centers a taller-than-target render, padding left and right, and grows cellsPerImageWidth", () => {
    // 1000×2000, 10 cells across the 1000px width (100px/cell). Padded to a
    // 2000×2000 square: the content is centered horizontally (500px each
    // side), and the SAME 100px cell now has to span the doubled width, so
    // twice as many cells fit across it.
    const g = padToAspect(1000, 2000, 10, 1);
    expect(g.effWidth).toBe(2000);
    expect(g.effHeight).toBe(2000);
    expect(g.offsetX).toBe(500);
    expect(g.offsetY).toBe(0);
    expect(g.cellsPerImageWidth).toBe(20);
    expect(g.originXPct).toBe(0.25);
    expect(g.originYPct).toBe(0);
  });

  it("degrades to the unscaled cell count rather than dividing by zero on a degenerate width", () => {
    const g = padToAspect(0, 0, 12, 1);
    expect(g.cellsPerImageWidth).toBe(12);
    expect(g.originXPct).toBe(0);
    expect(g.originYPct).toBe(0);
  });

  it("pads to a non-square target aspect, e.g. widening a square render to 16:9", () => {
    // 1000×1000 padded to 16:9 (1.778): height shrinks relative to the now-
    // wider effective canvas, so width is padded instead: eff width =
    // 1000 * 1.778 = 1777.8, height stays 1000.
    const g = padToAspect(1000, 1000, 10, 16 / 9);
    expect(g.effWidth).toBeCloseTo(1777.78, 1);
    expect(g.effHeight).toBe(1000);
    expect(g.offsetY).toBe(0);
    expect(g.offsetX).toBeGreaterThan(0);
  });
});

describe("padToStyleAspect", () => {
  it("leaves an in-range aspect alone", () => {
    const g = padToStyleAspect(1600, 900, 16); // 16:9, well within [1:3, 3:1]
    expect(g.effWidth).toBe(1600);
    expect(g.effHeight).toBe(900);
  });

  it("pads a wider-than-3:1 render up to exactly 3:1", () => {
    const g = padToStyleAspect(3000, 500, 30); // 6:1, twice the allowed 3:1
    expect(g.effWidth).toBe(3000);
    expect(g.effHeight).toBe(1000); // 3000 / 3
  });

  it("pads a taller-than-1:3 render up to exactly 1:3", () => {
    const g = padToStyleAspect(500, 3000, 5); // 1:6, twice as extreme as 1:3
    expect(g.effHeight).toBe(3000);
    expect(g.effWidth).toBe(1000); // 3000 / 3
  });
});

describe("chooseStyleImageSize", () => {
  it("spends the full 2560x1440 budget exactly at 16:9", () => {
    expect(chooseStyleImageSize(1600, 900)).toEqual({ width: 2560, height: 1440 });
  });

  it("spends it at ~1920x1920 for a square render", () => {
    expect(chooseStyleImageSize(1000, 1000)).toEqual({ width: 1920, height: 1920 });
  });

  it("spends it at ~1104x3312 for the 1:3 boundary", () => {
    expect(chooseStyleImageSize(1000, 3000)).toEqual({ width: 1104, height: 3312 });
  });

  it("rounds down rather than up, so the total never exceeds the budget", () => {
    const { width, height } = chooseStyleImageSize(1600, 900);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(width * height).toBeLessThanOrEqual(2560 * 1440);
  });
});
