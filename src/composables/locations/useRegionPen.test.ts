import { describe, it, expect } from "vitest";
import type { GridPoint } from "@/types/locationMapRegion.types";
import type { GridCalibration } from "@/types/location.types";
import {
  addDraftPoint,
  canCloseDraft,
  closeDraft,
  abandonDraft,
  moveRingVertex,
  deleteRingVertex,
  insertRingVertex,
  isNearFirstNode,
  startTemplateDrag,
  updateTemplateDrag,
  gridPointToCanvas,
  canvasToGridPoint,
  cellFractionSize,
  useRegionPen,
  TEMPLATE_SHAPES,
  TEMPLATE_SHAPE_LABELS,
  useTemplateShape,
} from "./useRegionPen";

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

describe("addDraftPoint", () => {
  it("appends a point", () => {
    expect(addDraftPoint([], [1, 1])).toEqual([[1, 1]]);
    expect(addDraftPoint([[0, 0]], [1, 1])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("canCloseDraft / closeDraft", () => {
  it("refuses to close below 3 distinct points", () => {
    expect(canCloseDraft([])).toBe(false);
    expect(canCloseDraft([[0, 0]])).toBe(false);
    expect(
      canCloseDraft([
        [0, 0],
        [1, 0],
      ]),
    ).toBe(false);
    expect(closeDraft([[0, 0]])).toBeNull();
  });

  it("closes and simplifies once 3 distinct points exist", () => {
    expect(canCloseDraft(TRIANGLE)).toBe(true);
    expect(closeDraft(TRIANGLE)).toEqual(TRIANGLE);
  });

  it("drops a collinear midpoint on close", () => {
    const withMidpoint: GridPoint[] = [
      [0, 0],
      [2, 0],
      [4, 0],
      [2, 4],
    ];
    expect(closeDraft(withMidpoint)).toEqual([
      [0, 0],
      [4, 0],
      [2, 4],
    ]);
  });
});

describe("abandonDraft", () => {
  it("always returns an empty ring", () => {
    expect(abandonDraft()).toEqual([]);
  });
});

describe("moveRingVertex / deleteRingVertex / insertRingVertex", () => {
  it("moves the vertex at the given index", () => {
    expect(moveRingVertex(TRIANGLE, 0, [9, 9])).toEqual([
      [9, 9],
      [4, 0],
      [2, 4],
    ]);
  });

  it("refuses to delete below 3 points", () => {
    expect(deleteRingVertex(TRIANGLE, 0)).toEqual(TRIANGLE);
  });

  it("deletes a vertex once above 3 points", () => {
    const square: GridPoint[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(deleteRingVertex(square, 0)).toEqual([
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
  });

  it("inserts a vertex after the given index", () => {
    expect(insertRingVertex(TRIANGLE, 0, [2, 0])).toEqual([
      [0, 0],
      [2, 0],
      [4, 0],
      [2, 4],
    ]);
  });
});

describe("isNearFirstNode", () => {
  it("is false when the ring isn't closeable yet", () => {
    expect(isNearFirstNode([[0, 0]], 0, 0, 1)).toBe(false);
  });

  it("is true only near the ring's own first point", () => {
    expect(isNearFirstNode(TRIANGLE, 0.2, 0.2, 0.5)).toBe(true);
    expect(isNearFirstNode(TRIANGLE, 4, 0.2, 0.5)).toBe(false);
    expect(isNearFirstNode(TRIANGLE, 20, 20, 0.5)).toBe(false);
  });
});

describe("template drag", () => {
  it("starts at radius 0 and grows with distance from the centre", () => {
    const started = startTemplateDrag("octagon", [5, 5]);
    expect(started).toEqual({ shape: "octagon", center: [5, 5], radius: 0 });
    const dragged = updateTemplateDrag(started, [8, 5]);
    expect(dragged.radius).toBe(3);
  });

  it("rounds the radius to whole cells", () => {
    const started = startTemplateDrag("circle", [0, 0]);
    const dragged = updateTemplateDrag(started, [2, 2]);
    expect(dragged.radius).toBe(Math.round(Math.hypot(2, 2)));
  });
});

describe("gridPointToCanvas / canvasToGridPoint", () => {
  it("round-trips a point through the canvas conversion", () => {
    const canvasPoint = gridPointToCanvas([3, 4], CALIBRATION, 1000, 1000, 500, 500);
    const back = canvasToGridPoint(canvasPoint.x, canvasPoint.y, CALIBRATION, 1000, 1000, 500, 500);
    expect(back[0]).toBeCloseTo(3);
    expect(back[1]).toBeCloseTo(4);
  });

  it("falls back to the origin cell on a degenerate calibration", () => {
    const degenerate: GridCalibration = { ...CALIBRATION, cells_per_image_width: 0 };
    expect(gridPointToCanvas([3, 4], degenerate, 1000, 1000, 500, 500)).toEqual({ x: 0, y: 0 });
    expect(canvasToGridPoint(100, 100, degenerate, 1000, 1000, 500, 500)).toEqual([0, 0]);
  });
});

describe("cellFractionSize", () => {
  it("derives a square-ish per-cell fraction from the calibration", () => {
    const size = cellFractionSize(CALIBRATION, 1000, 1000);
    expect(size).toEqual({ cellWFrac: 0.1, cellHFrac: 0.1 });
  });

  it("is null on a degenerate calibration or image", () => {
    expect(cellFractionSize({ ...CALIBRATION, cells_per_image_width: 0 }, 1000, 1000)).toBeNull();
    expect(cellFractionSize(CALIBRATION, 0, 1000)).toBeNull();
  });
});

describe("template shape picker", () => {
  it("lists all three shapes with a label each", () => {
    expect(TEMPLATE_SHAPES).toEqual(["circle", "octagon", "hex"]);
    for (const shape of TEMPLATE_SHAPES) expect(TEMPLATE_SHAPE_LABELS[shape]).toBeTruthy();
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
