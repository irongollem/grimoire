// The battle cells a map picture covers. Pure and edge-importable (relative `.ts` imports only): the browser reads it
// from the picture's natural size, the server from the shape the calibration records (`image_height_over_width`).

/** The battle cells of the map picture; cell (0,0) is its top-left. */
export interface MapGrid {
  cols: number;
  rows: number;
}

/**
 * The grid of a picture `cellsAcross` squares wide and `heightOverWidth` times as tall. The column count is a whole
 * number (rounded up, as the Explore screen does with its frame): a calibration like 29.9999 would otherwise make
 * every row-major index `j * cols + i` fractional and sight would read only row 0. The rows follow the unrounded
 * width, which is the one the picture is drawn at. Null for a width or a ratio that is not a positive number.
 */
export function gridFromRatio(cellsAcross: number | null | undefined, heightOverWidth: number | null | undefined): MapGrid | null {
  if (cellsAcross == null || !Number.isFinite(cellsAcross) || cellsAcross <= 0) return null;
  if (heightOverWidth == null || !Number.isFinite(heightOverWidth) || heightOverWidth <= 0) return null;
  return { cols: Math.ceil(cellsAcross), rows: Math.ceil(cellsAcross * heightOverWidth) };
}

/** The same from the picture's natural size; null until that is known. */
export function imageGrid(cellsAcross: number | null | undefined, size: { w: number; h: number } | null): MapGrid | null {
  if (!size || !Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w <= 0 || size.h <= 0) return null;
  return gridFromRatio(cellsAcross, size.h / size.w);
}
