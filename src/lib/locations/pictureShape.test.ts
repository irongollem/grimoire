import { describe, expect, it } from "vitest";
import type { GridCalibration } from "../../types/location.types";
import { pictureShapeUpdate } from "./pictureShape";

const cal = (over: Partial<GridCalibration> = {}): GridCalibration => ({ cells_per_image_width: 16, origin_x_pct: 0, origin_y_pct: 0, ...over });
const picture = (calibration: GridCalibration | null) => ({
  map_url: "p.png", grid_calibration: calibration, map_layer_url: null, map_layer_stand_url: null, map_layer_calibration: null, plan_size: null,
});
const drawing = (calibration: GridCalibration | null) => ({ ...picture(cal()), map_layer_url: "d.png", map_layer_calibration: calibration });

describe("pictureShapeUpdate", () => {
  it("writes the measured shape into a calibration that has none (1000 by 750 is 0.75 tall)", () => {
    // Bug it fails on: leaving every old map without a shape, so the server never learns where it ends.
    expect(pictureShapeUpdate(picture(cal()), { width: 1000, height: 750 })).toEqual({
      column: "grid_calibration",
      calibration: cal({ image_height_over_width: 0.75 }),
    });
  });

  it("writes into the Drawing's calibration when there is a Drawing, because that is the layer the battle map reads", () => {
    // Bug it fails on: healing the Picture's calibration under a Drawing, which the fight never reads.
    const fix = pictureShapeUpdate(drawing(cal()), { width: 400, height: 300 });
    expect(fix?.column).toBe("map_layer_calibration");
  });

  it("leaves a stored shape within half a percent alone, and corrects one beyond it", () => {
    // Measured 0.75. 0.7530 is 0.4% off: the same picture. 0.7540 is 0.53% off: a different one.
    expect(pictureShapeUpdate(picture(cal({ image_height_over_width: 0.753 })), { width: 1000, height: 750 })).toBeNull();
    expect(pictureShapeUpdate(picture(cal({ image_height_over_width: 0.754 })), { width: 1000, height: 750 })?.calibration.image_height_over_width).toBe(0.75);
  });

  it("keeps everything else the calibration carries", () => {
    // Bug it fails on: rebuilding the calibration and losing the origin cell a publish wrote.
    const fix = pictureShapeUpdate(picture(cal({ origin_cell_x: 4, origin_cell_y: -2, grid_opacity: 0.2, origin_x_pct: 0.1 })), { width: 100, height: 100 });
    expect(fix?.calibration).toMatchObject({ origin_cell_x: 4, origin_cell_y: -2, grid_opacity: 0.2, origin_x_pct: 0.1, image_height_over_width: 1 });
  });

  it("has nothing to write for an uncalibrated picture, no picture, or a size that is not a size", () => {
    expect(pictureShapeUpdate(picture(null), { width: 10, height: 10 })).toBeNull();
    expect(pictureShapeUpdate({ ...picture(null), map_url: null }, { width: 10, height: 10 })).toBeNull();
    expect(pictureShapeUpdate(picture(cal()), { width: 0, height: 10 })).toBeNull();
    expect(pictureShapeUpdate(picture(cal()), { width: 10, height: Number.NaN })).toBeNull();
  });
});
