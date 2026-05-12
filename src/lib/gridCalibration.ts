import type { GridCalibration } from "@/types/location.types";

export interface CalibrateGridInput {
  /** First handle, normalised 0..1 across the image's natural width/height. */
  pointAPct: { x: number; y: number };
  /** Second handle, same coordinate space as pointAPct. */
  pointBPct: { x: number; y: number };
  /** Number of 5-ft squares the DM says span between A and B. */
  cellsBetween: number;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
}

export function calibrateGrid(input: CalibrateGridInput): GridCalibration {
  const { pointAPct, pointBPct, cellsBetween, imageNaturalWidth, imageNaturalHeight } = input;

  if (cellsBetween <= 0) {
    throw new Error("cellsBetween must be a positive number");
  }

  const ax = pointAPct.x * imageNaturalWidth;
  const ay = pointAPct.y * imageNaturalHeight;
  const bx = pointBPct.x * imageNaturalWidth;
  const by = pointBPct.y * imageNaturalHeight;
  const distPx = Math.hypot(bx - ax, by - ay);

  if (distPx === 0) {
    throw new Error("calibration handles must be at different points");
  }

  const pixelsPerCell = distPx / cellsBetween;
  return {
    cells_per_image_width: imageNaturalWidth / pixelsPerCell,
    origin_x_pct: 0,
    origin_y_pct: 0,
  };
}
