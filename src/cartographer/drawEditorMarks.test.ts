import { describe, expect, it, vi } from "vitest";
import { paintEditorMarks } from "./drawEditorMarks";
import { emptyLayers } from "@/types/dungeonMap.types";

function context(): CanvasRenderingContext2D {
  const ctx: Partial<CanvasRenderingContext2D> = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillStyle: "", strokeStyle: "",
  };
  return ctx as CanvasRenderingContext2D;
}

describe("brush footprint", () => {
  it("a moving brush fills one continuous footprint without outlining every overlapping stamp", () => {
    // Maintainer's brush performance brief: footprint is cheap; app convention: marks use cell coordinates.
    const ctx = context();
    const path = {} as Path2D;
    paintEditorMarks(ctx, emptyLayers(), { brushStroke: { path, erase: false } }, 128, { x: 60, y: 90 });
    expect(ctx.translate).toHaveBeenCalledWith(-60, -90);
    expect(ctx.scale).toHaveBeenCalledWith(128, 128);
    expect(ctx.fill).toHaveBeenCalledWith(path);
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it("Alt carving has a different footprint tone from growing", () => {
    // Maintainer's brush performance brief: distinguish carve preview from growth.
    const ctx = context();
    const path = {} as Path2D;
    paintEditorMarks(ctx, emptyLayers(), { brushStroke: { path, erase: false } }, 128, { x: 0, y: 0 });
    const growth = ctx.fillStyle;
    paintEditorMarks(ctx, emptyLayers(), { brushStroke: { path, erase: true } }, 128, { x: 0, y: 0 });
    expect(ctx.fillStyle).not.toBe(growth);
  });

  it("an idle brush does not leave a footprint on the map", () => {
    const ctx = context();
    paintEditorMarks(ctx, emptyLayers(), {}, 128, { x: 0, y: 0 });
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

describe("run rings (Trace the walls)", () => {
  function ringCtx() {
    const arcs: { lineWidth: number; strokeStyle: string }[] = [];
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      setLineDash: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "",
      arc: vi.fn(function (this: { lineWidth: number; strokeStyle: string }, _x: number, _y: number, r: number) {
        if (r > 10) arcs.push({ lineWidth: this.lineWidth, strokeStyle: this.strokeStyle });
      }),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, arcs };
  }
  const points: [number, number][] = [[0, 0], [3, 0], [3, 3]];

  it("draws a thick gilt ring round the first point when the hover would close the ring", () => {
    // Ring radius 0.2 cells * 100 px = 20, above the 6 px point dots, so only rings pass the r > 10 filter.
    const { ctx, arcs } = ringCtx();
    paintEditorMarks(ctx, emptyLayers(), { wallRun: { points, hover: [0, 0] } }, 100, { x: 0, y: 0 });
    expect(arcs).toEqual([{ lineWidth: 2.5, strokeStyle: "#c9962e" }]);
  });

  it("draws a thinner gilt ring where the hover has caught a wall end", () => {
    const { ctx, arcs } = ringCtx();
    const layers = emptyLayers();
    layers.walls.w = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a: [6, 6], b: [8, 6] };
    paintEditorMarks(ctx, layers, { wallRun: { points, hover: [8, 6] } }, 100, { x: 0, y: 0 });
    expect(arcs).toEqual([{ lineWidth: 1.5, strokeStyle: "#c9962e" }]);
  });

  it("draws no ring on the start while the run has fewer than three points", () => {
    const { ctx, arcs } = ringCtx();
    paintEditorMarks(ctx, emptyLayers(), { wallRun: { points: [[0, 0], [3, 0]], hover: [0, 0] } }, 100, { x: 0, y: 0 });
    expect(arcs).toEqual([]);
  });

  it("draws no ring for a hover over open grid", () => {
    const { ctx, arcs } = ringCtx();
    paintEditorMarks(ctx, emptyLayers(), { wallRun: { points, hover: [5, 5] } }, 100, { x: 0, y: 0 });
    expect(arcs).toEqual([]);
  });
});
