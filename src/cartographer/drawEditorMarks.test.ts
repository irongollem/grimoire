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
