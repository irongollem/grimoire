import { describe, it, expect } from "vitest";
import {
  BLANK_CELL_PX,
  buildMapStack,
  frameCalibration,
  hasAnyMapLayer,
  placePicture,
  primaryImage,
  type MapStack,
  type MapStackSource,
} from "./mapStack";
import type { GridCalibration } from "@/types/location.types";

function source(over: Partial<MapStackSource> = {}): MapStackSource {
  return {
    map_url: null,
    grid_calibration: null,
    map_layer_url: null,
    map_layer_calibration: null,
    plan_size: null,
    ...over,
  };
}

describe("buildMapStack", () => {
  it("is the all-null stack for null/undefined", () => {
    for (const loc of [null, undefined]) {
      expect(buildMapStack(loc)).toEqual({
        picture: null,
        drawing: null,
        primary: null,
        frameCalibration: null,
        blank: null,
        hasAnyLayer: false,
      });
    }
  });

  it("is the all-null stack for a location with nothing set", () => {
    expect(buildMapStack(source())).toEqual({
      picture: null,
      drawing: null,
      primary: null,
      frameCalibration: null,
      blank: null,
      hasAnyLayer: false,
    });
  });

  it("builds a picture-only stack", () => {
    const calibration: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = buildMapStack(source({ map_url: "/picture.webp", grid_calibration: calibration }));
    expect(stack.picture).toEqual({ kind: "picture", url: "/picture.webp", calibration });
    expect(stack.drawing).toBeNull();
    expect(stack.primary).toBe(stack.picture);
    expect(stack.frameCalibration).toBe(calibration);
    expect(stack.blank).toBeNull();
    expect(stack.hasAnyLayer).toBe(true);
  });

  it("builds a drawing-only stack", () => {
    const calibration: GridCalibration = { cells_per_image_width: 20, origin_x_pct: 0.1, origin_y_pct: 0.1 };
    const stack = buildMapStack(source({ map_layer_url: "/drawing.webp", map_layer_calibration: calibration }));
    expect(stack.drawing).toEqual({ kind: "drawing", url: "/drawing.webp", calibration });
    expect(stack.picture).toBeNull();
    expect(stack.primary).toBe(stack.drawing);
    expect(stack.frameCalibration).toBe(calibration);
    expect(stack.blank).toBeNull();
    expect(stack.hasAnyLayer).toBe(true);
  });

  it("a drawing without calibration is still the primary, with a null frame calibration", () => {
    const stack = buildMapStack(source({ map_layer_url: "/drawing.webp", map_layer_calibration: null }));
    expect(stack.drawing).toEqual({ kind: "drawing", url: "/drawing.webp", calibration: null });
    expect(stack.primary).toBe(stack.drawing);
    expect(stack.frameCalibration).toBeNull();
    expect(stack.hasAnyLayer).toBe(true);
  });

  it("prefers the drawing as primary when both layers exist", () => {
    const pictureCal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const drawingCal: GridCalibration = { cells_per_image_width: 16, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = buildMapStack(
      source({
        map_url: "/picture.webp",
        grid_calibration: pictureCal,
        map_layer_url: "/drawing.webp",
        map_layer_calibration: drawingCal,
      }),
    );
    expect(stack.picture).not.toBeNull();
    expect(stack.drawing).not.toBeNull();
    expect(stack.primary).toBe(stack.drawing);
    expect(stack.frameCalibration).toBe(drawingCal);
    expect(stack.blank).toBeNull();
  });

  it("builds a blank grid when neither image exists but plan_size is set", () => {
    const stack = buildMapStack(source({ plan_size: { cols: 12, rows: 8 } }));
    expect(stack.picture).toBeNull();
    expect(stack.drawing).toBeNull();
    expect(stack.primary).toBeNull();
    expect(stack.blank).toEqual({ cols: 12, rows: 8, cellPx: BLANK_CELL_PX });
    expect(stack.hasAnyLayer).toBe(true);
    expect(stack.frameCalibration).toEqual({
      cells_per_image_width: 12,
      origin_x_pct: 0,
      origin_y_pct: 0,
      origin_cell_x: 0,
      origin_cell_y: 0,
    });
  });

  it("ignores plan_size once an image layer exists", () => {
    const calibration: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = buildMapStack(
      source({ map_url: "/picture.webp", grid_calibration: calibration, plan_size: { cols: 12, rows: 8 } }),
    );
    expect(stack.blank).toBeNull();
    expect(stack.primary).toBe(stack.picture);
  });
});

describe("hasAnyMapLayer / frameCalibration / primaryImage", () => {
  it("hasAnyMapLayer mirrors buildMapStack().hasAnyLayer", () => {
    expect(hasAnyMapLayer(null)).toBe(false);
    expect(hasAnyMapLayer(source({ plan_size: { cols: 4, rows: 4 } }))).toBe(true);
  });

  it("frameCalibration mirrors buildMapStack().frameCalibration", () => {
    const calibration: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    expect(frameCalibration(source({ map_url: "/p.webp", grid_calibration: calibration }))).toBe(calibration);
    expect(frameCalibration(null)).toBeNull();
  });

  it("primaryImage returns the drawing over the picture, and null with no image layer", () => {
    expect(primaryImage(source({ plan_size: { cols: 4, rows: 4 } }))).toBeNull();
    expect(primaryImage(source({ map_url: "/p.webp" }))).toEqual({ url: "/p.webp", calibration: null });
    expect(
      primaryImage(source({ map_url: "/p.webp", map_layer_url: "/d.webp" })),
    ).toEqual({ url: "/d.webp", calibration: null });
  });
});

describe("placePicture", () => {
  function stackWith(pictureCal: GridCalibration | null, drawingCal: GridCalibration | null): MapStack {
    return buildMapStack(
      source({
        map_url: "/picture.webp",
        grid_calibration: pictureCal,
        map_layer_url: "/drawing.webp",
        map_layer_calibration: drawingCal,
      }),
    );
  }

  it("is null when only one layer exists", () => {
    const stack = buildMapStack(source({ map_url: "/picture.webp", grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 } }));
    expect(placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 1000 })).toBeNull();
  });

  it("is null when the picture has no calibration", () => {
    const stack = stackWith(null, { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 });
    expect(placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 1000 })).toBeNull();
  });

  it("is null when the drawing has no calibration", () => {
    const stack = stackWith({ cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 }, null);
    expect(placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 1000 })).toBeNull();
  });

  it("places identical calibrations covering the whole frame", () => {
    const cal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = stackWith(cal, cal);
    const rect = placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 1000 });
    expect(rect?.left).toBeCloseTo(0, 10);
    expect(rect?.top).toBeCloseTo(0, 10);
    expect(rect?.width).toBeCloseTo(1, 10);
    expect(rect?.height).toBeCloseTo(1, 10);
  });

  it("covers the same cells at half the picture's pixel density", () => {
    const cal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = stackWith(cal, cal);
    // Same cell count, half the picture's pixel resolution.
    const rect = placePicture(stack, { w: 1000, h: 1000 }, { w: 500, h: 500 });
    expect(rect?.width).toBeCloseTo(1, 10);
    expect(rect?.height).toBeCloseTo(1, 10);
  });

  it("shifts left by the origin-cell offset between picture and drawing", () => {
    const drawingCal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 };
    const pictureCal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 2, origin_cell_y: 0 };
    const stack = stackWith(pictureCal, drawingCal);
    const rect = placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 1000 });
    const pCell = 1 / drawingCal.cells_per_image_width;
    expect(rect?.left).toBeCloseTo(2 * pCell, 10);
    expect(rect?.top).toBeCloseTo(0, 10);
  });

  it("is null for a non-positive natural dimension", () => {
    const cal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = stackWith(cal, cal);
    expect(placePicture(stack, { w: 0, h: 1000 }, { w: 1000, h: 1000 })).toBeNull();
    expect(placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 0 })).toBeNull();
  });

  it("is null for a non-positive cells_per_image_width", () => {
    const bad: GridCalibration = { cells_per_image_width: 0, origin_x_pct: 0, origin_y_pct: 0 };
    const cal: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };
    const stack = stackWith(bad, cal);
    expect(placePicture(stack, { w: 1000, h: 1000 }, { w: 1000, h: 1000 })).toBeNull();
  });
});
