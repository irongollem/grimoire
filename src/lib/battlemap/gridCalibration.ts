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
  // Anchor the grid so handle A sits exactly on a grid intersection: the
  // origin is A's pixel coordinate taken modulo the cell size. Since 5e
  // cells are square, the same pixelsPerCell applies on both axes, so B
  // also lands on a grid intersection when the A→B line is axis-aligned
  // (the common case).
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  const originXpx = mod(ax, pixelsPerCell);
  const originYpx = mod(ay, pixelsPerCell);
  return {
    cells_per_image_width: imageNaturalWidth / pixelsPerCell,
    origin_x_pct: imageNaturalWidth > 0 ? originXpx / imageNaturalWidth : 0,
    origin_y_pct: imageNaturalHeight > 0 ? originYpx / imageNaturalHeight : 0,
  };
}
