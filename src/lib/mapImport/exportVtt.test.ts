import { describe, expect, it } from "vitest";
import { emptyLayers } from "@/types/dungeonMap.types";
import { drawingToUvttInput } from "./exportVtt";

const ref = { pack_id: "p", pack_version: 1, variant: 0 };

describe("drawingToUvttInput", () => {
  it("shifts the Drawing's walls into the bake's grid, whose top-left cell is the padded corner", () => {
    const layers = emptyLayers();
    layers.walls["5,5:N"] = { ...ref, type: "wall", a: [5, 5], b: [6, 5] };
    layers.walls["abc"] = { ...ref, type: "doorClosed", a: [7, 5], b: [8, 6] };
    const out = drawingToUvttInput({
      layers, runtimes: new Map(), dressing: new Map(), originCellX: 2, originCellY: 3, cols: 20, rows: 10, pixelsPerGrid: 70, imageBase64: "AAAA",
    });
    expect(out.walls).toEqual([{ a: [3, 2], b: [4, 2] }]);
    expect(out.doors).toEqual([{ a: [5, 2], b: [6, 3], open: false }]);
    expect(out.pixelsPerGrid).toBe(70);
  });

  it("exports a door in the state it was drawn, open or shut", () => {
    const layers = emptyLayers();
    layers.walls["u1"] = { ...ref, type: "doorOpen", a: [0, 0], b: [1, 0] };
    const out = drawingToUvttInput({
      layers, runtimes: new Map(), dressing: new Map(), originCellX: 0, originCellY: 0, cols: 5, rows: 5, pixelsPerGrid: 70, imageBase64: "",
    });
    expect(out.doors[0].open).toBe(true);
  });

  it("exports a placed light shifted into the bake's grid, reaching as far as its bright and dim light together", () => {
    const layers = emptyLayers();
    // 20 ft bright and 10 ft dim reach 30 ft: six 5 ft squares.
    layers.lights["l1"] = { x: 12.5, y: 9.5, light: { color: "#ffaa00", bright: 20, dim: 10, intensity: 0.5 } };
    const out = drawingToUvttInput({
      layers, runtimes: new Map(), dressing: new Map(), originCellX: 2, originCellY: 3, cols: 20, rows: 10, pixelsPerGrid: 70, imageBase64: "",
    });
    expect(out.lights).toEqual([{ x: 10.5, y: 6.5, rangeCells: 6, intensity: 0.5, color: "#ffaa00" }]);
  });
});
