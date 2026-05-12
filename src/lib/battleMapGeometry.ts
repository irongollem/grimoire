// Pure geometry helpers for the VTT battle map. Convert image-space grid
// calibration + viewport pan/zoom into canvas-space coordinates for drawing
// grid lines and snapping tokens. Kept side-effect-free so the canvas
// renderer in the Vue view stays a thin reactive shell.

export interface DisplayParams {
  /** Viewport pan offset in canvas pixels. */
  panX: number;
  panY: number;
  /** Zoom factor (1 = image at natural size). */
  scale: number;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
}

export interface CalibrationParams {
  cellsPerImageWidth: number;
  originXPct: number;
  originYPct: number;
}

/**
 * Returns the canvas-space positions of grid lines along a single axis,
 * intersecting the viewport `[0, viewportLength]`. `start` is the canvas
 * coordinate of the line at cell index 0; subsequent lines are at multiples
 * of `spacing` from there. Both directions are walked so a negative `start`
 * (origin off-screen to the left/above) still produces in-viewport lines.
 */
export function gridLinePositions(start: number, viewportLength: number, spacing: number): number[] {
  if (spacing <= 0 || viewportLength <= 0) return [];
  // Snap start into [0, spacing) by walking the closest in-viewport line.
  const firstIndex = Math.ceil((0 - start) / spacing);
  const firstPos = start + firstIndex * spacing;
  const result: number[] = [];
  for (let pos = firstPos; pos <= viewportLength; pos += spacing) {
    result.push(pos);
  }
  return result;
}

/**
 * Display-pixel width of one grid cell given a calibration and zoom scale.
 * Cells are square in 5e — same value applies vertically.
 */
export function cellSizeInDisplay(opts: {
  imageNaturalWidth: number;
  cellsPerImageWidth: number;
  scale: number;
}): number {
  if (opts.cellsPerImageWidth <= 0) return 0;
  return (opts.imageNaturalWidth / opts.cellsPerImageWidth) * opts.scale;
}

/**
 * Canvas-space coordinate of cell (0, 0)'s top-left corner, given current
 * pan/zoom and the calibration's origin percentages.
 */
export function gridOriginInDisplay(opts: DisplayParams & {
  originXPct: number;
  originYPct: number;
}): { x: number; y: number } {
  return {
    x: opts.panX + opts.originXPct * opts.imageNaturalWidth * opts.scale,
    y: opts.panY + opts.originYPct * opts.imageNaturalHeight * opts.scale,
  };
}
