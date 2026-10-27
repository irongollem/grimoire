import { describe, it, expect } from "vitest";
import type { GridPoint } from "@/types/locationMapRegion.types";
import type { GridCalibration } from "@/types/location.types";
import { gridPointToCanvas, canvasToGridPoint, useRegionPen, useTemplateShape } from "./useRegionPen";

const TRIANGLE: GridPoint[] = [
  [0, 0],
  [4, 0],
  [2, 4],
];

const CALIBRATION: GridCalibration = {
  cells_per_image_width: 10,
  origin_x_pct: 0,
  origin_y_pct: 0,
  origin_cell_x: 0,
  origin_cell_y: 0,
};

describe("gridPointToCanvas / canvasToGridPoint", () => {
  it("round-trips a point through the canvas conversion", () => {
    const canvasPoint = gridPointToCanvas([3, 4], CALIBRATION, 1000, 1000, 500, 500);
    const back = canvasToGridPoint(canvasPoint.x, canvasPoint.y, CALIBRATION, 1000, 1000, 500, 500);
    expect(back[0]).toBeCloseTo(3);
    expect(back[1]).toBeCloseTo(4);
  });

  // 10 cells across a 1000x500 image: a cell is 0.1 of the width and 0.2 of the height.
  // Point (3,4) with the grid anchored at cell (2,1) = image fraction (0.1, 0.05):
  // x = 0.1 + (3-2)*0.1 = 0.2 of a 500px canvas, y = 0.05 + (4-1)*0.2 = 0.65 of a 300px one.
  it("places a point from an offset origin on a canvas that is not square, and reads it back", () => {
    const offset: GridCalibration = { ...CALIBRATION, origin_x_pct: 0.1, origin_y_pct: 0.05, origin_cell_x: 2, origin_cell_y: 1 };
    const canvasPoint = gridPointToCanvas([3, 4], offset, 1000, 500, 500, 300);
    expect(canvasPoint.x).toBeCloseTo(100);
    expect(canvasPoint.y).toBeCloseTo(195);
    const back = canvasToGridPoint(100, 195, offset, 1000, 500, 500, 300);
    expect(back[0]).toBeCloseTo(3);
    expect(back[1]).toBeCloseTo(4);
  });

  it("answers the origin cell for a canvas with no size", () => {
    const offset: GridCalibration = { ...CALIBRATION, origin_cell_x: 2, origin_cell_y: 1 };
    expect(canvasToGridPoint(100, 100, offset, 1000, 500, 0, 300)).toEqual([2, 1]);
    expect(canvasToGridPoint(100, 100, offset, 1000, 500, 500, 0)).toEqual([2, 1]);
  });

  it("falls back to the origin cell on a degenerate calibration", () => {
    const degenerate: GridCalibration = { ...CALIBRATION, cells_per_image_width: 0 };
    expect(gridPointToCanvas([3, 4], degenerate, 1000, 1000, 500, 500)).toEqual({ x: 0, y: 0 });
    expect(canvasToGridPoint(100, 100, degenerate, 1000, 1000, 500, 500)).toEqual([0, 0]);
  });
});

describe("template shape picker", () => {
  it("starts on the octagon", () => {
    // app convention (frame 12): the octagon is the default template
    expect(useTemplateShape().value).toBe("octagon");
  });

  it("is a shared singleton across callers", () => {
    const a = useTemplateShape();
    const b = useTemplateShape();
    a.value = "hex";
    expect(b.value).toBe("hex");
    a.value = "octagon"; // reset so other tests in this file see the default
  });
});

describe("useRegionPen", () => {
  it("builds a draft ring across clicks and closes it once valid", () => {
    const pen = useRegionPen();
    expect(pen.close()).toBeNull();

    pen.addPoint([0, 0]);
    pen.addPoint([4, 0]);
    expect(pen.close()).toBeNull();

    pen.addPoint([2, 4]);
    const closed = pen.close();
    expect(closed).toEqual(TRIANGLE);
    expect(pen.draftRing.value).toEqual([]);
  });

  it("abandon discards an unsaved draft", () => {
    const pen = useRegionPen();
    pen.addPoint([0, 0]);
    pen.addPoint([1, 0]);
    pen.abandon();
    expect(pen.draftRing.value).toEqual([]);
  });

  it("dragging with no template started does nothing", () => {
    const pen = useRegionPen();
    pen.dragTemplate([3, 4]);
    expect(pen.templateDrag.value).toBeNull();
  });

  it("tracks a template drag start-to-end", () => {
    const pen = useRegionPen();
    expect(pen.endTemplate()).toBeNull();

    pen.startTemplate("hex", [0, 0]);
    pen.dragTemplate([3, 4]);
    expect(pen.templateDrag.value?.radius).toBe(5);

    const final = pen.endTemplate();
    expect(final).toEqual({ shape: "hex", center: [0, 0], radius: 5 });
    expect(pen.templateDrag.value).toBeNull();
  });
});
