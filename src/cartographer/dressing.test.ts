import { describe, expect, it, vi } from "vitest";
import type { DressingPlacement } from "@/types/dungeonMap.types";
import {
  drawDressing,
  dressingCellBounds,
  dressingCorners,
  dressingDrawOrder,
  dressingFootprint,
  hitTestDressing,
  nextDressingZ,
  strokeDressingOutline,
  type DressingCatalog,
  type DressingProp,
} from "./dressing";

function prop(id: string, w: number, h: number, image: CanvasImageSource | null = null): DressingProp {
  return { id, name: id, footprint_w: w, footprint_h: h, image, flat: false, light: null, url: null, sway: null };
}
const catalog: DressingCatalog = new Map([
  ["table", prop("table", 2, 1)],
  ["bed", prop("bed", 2, 3)],
]);
function at(prop_id: string, x: number, y: number, rotation = 0, z = 0): DressingPlacement {
  return { prop_id, x, y, rotation, z };
}

describe("dressingFootprint", () => {
  it("reads the catalog, and counts a missing prop as 1x1", () => {
    expect(dressingFootprint(at("bed", 0, 0), catalog)).toEqual({ w: 2, h: 3 });
    expect(dressingFootprint(at("gone", 0, 0), catalog)).toEqual({ w: 1, h: 1 });
  });
});

describe("dressingCorners", () => {
  it("returns the plain box at 0 degrees", () => {
    expect(dressingCorners(at("table", 3, 4), 2, 1).map((c) => [c.x, c.y])).toEqual([[3, 4], [5, 4], [5, 5], [3, 5]]);
  });
});

describe("dressingCellBounds", () => {
  it("covers every cell of the unrotated footprint", () => {
    expect(dressingCellBounds(at("table", 3, 4), catalog)).toEqual({ minX: 3, minY: 4, maxX: 4, maxY: 4 });
  });
  it("swaps the extent on a quarter turn without spilling a cell", () => {
    // 2x1 at (3,4) turned 90 stands 1x2 with its top-left on the anchor: x 3..4, y 4..6, whole cells
    expect(dressingCellBounds(at("table", 3, 4, 90), catalog)).toEqual({ minX: 3, minY: 4, maxX: 3, maxY: 5 });
    expect(dressingCellBounds(at("table", 3, 4, 270), catalog)).toEqual({ minX: 3, minY: 4, maxX: 3, maxY: 5 });
    expect(dressingCellBounds(at("table", 3, 4, 180), catalog)).toEqual({ minX: 3, minY: 4, maxX: 4, maxY: 4 });
  });
  it("is unchanged by a half turn", () => {
    expect(dressingCellBounds(at("table", 3, 4, 180), catalog)).toEqual(dressingCellBounds(at("table", 3, 4), catalog));
  });
  it("grows on a diagonal turn", () => {
    const b = dressingCellBounds(at("table", 0, 0, 45), catalog);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(2);
    expect(b.maxY - b.minY).toBeGreaterThanOrEqual(1);
  });
});

describe("dressingDrawOrder / nextDressingZ", () => {
  it("sorts by z then id", () => {
    const layer = { b: at("table", 0, 0, 0, 1), a: at("table", 0, 0, 0, 1), c: at("table", 0, 0, 0, 0) };
    expect(dressingDrawOrder(layer).map(([id]) => id)).toEqual(["c", "a", "b"]);
  });
  it("puts a new prop on top, starting at 0", () => {
    expect(nextDressingZ({})).toBe(0);
    expect(nextDressingZ({ a: at("table", 0, 0, 0, 4), b: at("table", 0, 0, 0, 2) })).toBe(5);
  });
});

describe("hitTestDressing", () => {
  it("returns the topmost of overlapping props", () => {
    const layer = { low: at("table", 0, 0, 0, 0), high: at("table", 1, 0, 0, 1) };
    expect(hitTestDressing(layer, catalog, 1.5, 0.5)).toBe("high");
    expect(hitTestDressing(layer, catalog, 0.5, 0.5)).toBe("low");
  });
  it("returns null off every prop", () => {
    expect(hitTestDressing({ a: at("table", 0, 0) }, catalog, 5, 5)).toBeNull();
  });
  it("tests inside the rotated footprint", () => {
    const layer = { a: at("table", 3, 4, 90) };
    // the turned table covers x 3..4, y 4..6
    expect(hitTestDressing(layer, catalog, 3.5, 5.7)).toBe("a");
    expect(hitTestDressing(layer, catalog, 4.2, 4.5)).toBeNull();
    expect(hitTestDressing(layer, catalog, 3.5, 3.8)).toBeNull();
  });
});

describe("drawing", () => {
  function fakeCtx() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
  }
  it("draws the image over the footprint, about its centre", () => {
    const ctx = fakeCtx();
    const image = {} as CanvasImageSource;
    drawDressing(ctx, at("table", 0, 0, 90), prop("table", 2, 1, image), 10, 20, 100);
    // turned to stand 1x2 with its top-left on the anchor cell: centre half a cell in, one cell down
    expect(ctx.translate).toHaveBeenCalledWith(60, 120);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(image, -100, -50, 200, 100);
  });
  it("draws a placeholder when there is no image, and when the prop is missing", () => {
    const ctx = fakeCtx();
    drawDressing(ctx, at("table", 0, 0), prop("table", 2, 1), 0, 0, 100);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.roundRect).toHaveBeenCalledTimes(1);
    drawDressing(ctx, at("gone", 0, 0), undefined, 0, 0, 100);
    expect(ctx.roundRect).toHaveBeenCalledTimes(2);
  });
  it("scales the alpha for a ghost", () => {
    const ctx = fakeCtx();
    drawDressing(ctx, at("table", 0, 0), prop("table", 1, 1), 0, 0, 100, 0.5);
    expect(ctx.globalAlpha).toBe(0.5);
  });
  it("strokes the rotated outline", () => {
    const ctx = fakeCtx();
    strokeDressingOutline(ctx, at("table", 0, 0), 2, 1, 0, 0, 100, "red");
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
