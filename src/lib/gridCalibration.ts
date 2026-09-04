// Pure image-space grid maths for a location's `grid_calibration` (see
// `src/types/location.types.ts`). Anchors grid cells to the *image* — its
// natural pixel dimensions plus the calibration's origin/scale — rather than
// to the extent of whatever regions happen to be traced on it, which is the
// bug this module exists to fix (issue #805 slice 1: pure maths only, no
// wiring — callers still derive extent inline until a later slice).
//
// Companion modules, not superseded by this one:
//  - `src/lib/battlemap/gridCalibration.ts` derives a `GridCalibration` from
//    two handles dragged on the image (`calibrateGrid()`).
//  - `src/lib/battlemap/battleMapGeometry.ts` is display-space maths (canvas
//    pixels, pan, zoom) for the VTT. This module never touches pan/zoom — it
//    only knows the image's own coordinate space: 0..1 fractions of natural
//    width/height, and whole cell indices.
//
// Cell indices returned/consumed here are in *map-cell* space — the same
// space as a Cartographer `DungeonMap`'s `CellKey`
// (`src/types/dungeonMap.types.ts`), not necessarily "image cell (0,0)".
// `calibration.origin_cell_x/y` is the map-cell coordinate that image cell
// (0,0) corresponds to; see that field's docstring in `location.types.ts`
// for why the two can differ (bake padding).
//
// Serves locations, encounters, play and cartographer — a lone utility used
// by three-or-more features belongs at the root of `lib/` per CLAUDE.md's
// Module Placement table, not under `lib/locations/` or `lib/battlemap/`.

import { cellKey, parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";

export interface ImageFractionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `origin_cell_x/y`, defaulting to (0, 0) per that field's documented default. */
function resolveOriginCell(calibration: GridCalibration): { x: number; y: number } {
  return {
    x: calibration.origin_cell_x ?? 0,
    y: calibration.origin_cell_y ?? 0,
  };
}

/**
 * Pixel size of one (square) cell, or 0 when the calibration/image is too
 * degenerate to size a cell at all.
 */
function cellSizePx(calibration: GridCalibration, imageNaturalWidth: number): number {
  if (imageNaturalWidth <= 0 || calibration.cells_per_image_width <= 0) return 0;
  return imageNaturalWidth / calibration.cells_per_image_width;
}

/**
 * How many whole cells span the image, given a calibration and the image's
 * natural pixel dimensions.
 *
 * `cols` is `cells_per_image_width` rounded up — a calibration measured
 * between two handles (`calibrateGrid`) is rarely a whole number. `rows`
 * follows from the image's aspect ratio, since cells are square in pixel
 * space: `cols` cells of `imageNaturalWidth / cells_per_image_width` px
 * each span the width, so the same px size divided into the height gives
 * the row count.
 *
 * Degenerate inputs return `{ cols: 0, rows: 0 }` rather than throwing: a
 * non-positive image dimension is the ordinary state before an `<img>` has
 * loaded (not an error the caller made), and a non-positive
 * `cells_per_image_width` means "not usably calibrated" — both are states
 * callers already have to branch on, not exceptions to catch.
 */
export function gridExtent(
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): { cols: number; rows: number } {
  if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return { cols: 0, rows: 0 };
  if (calibration.cells_per_image_width <= 0) return { cols: 0, rows: 0 };
  const cols = Math.ceil(calibration.cells_per_image_width);
  const rows = Math.ceil(calibration.cells_per_image_width * (imageNaturalHeight / imageNaturalWidth));
  return { cols, rows };
}

/**
 * The map cell containing a point given as a 0..1 fraction of the image's
 * natural width/height. Accounts for the calibration's origin offset
 * (`origin_x_pct/y_pct`) and origin cell (`origin_cell_x/y`), so the result
 * is directly usable as a Cartographer `CellKey` — encounter spawns,
 * features, traps.
 *
 * Degenerate calibration/image inputs (see `gridExtent`) fall back to the
 * origin cell itself, since no cell size can be computed to offset from.
 */
export function cellAtImageFraction(
  fx: number,
  fy: number,
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): CellKey {
  const origin = resolveOriginCell(calibration);
  const size = cellSizePx(calibration, imageNaturalWidth);
  if (size <= 0 || imageNaturalHeight <= 0) return cellKey(origin.x, origin.y);

  const px = fx * imageNaturalWidth;
  const py = fy * imageNaturalHeight;
  const originXpx = calibration.origin_x_pct * imageNaturalWidth;
  const originYpx = calibration.origin_y_pct * imageNaturalHeight;

  const imageCellX = Math.floor((px - originXpx) / size);
  const imageCellY = Math.floor((py - originYpx) / size);

  return cellKey(imageCellX + origin.x, imageCellY + origin.y);
}

/**
 * The exact inverse of `cellAtImageFraction`: the given map cell's box,
 * back in 0..1 image fractions, for drawing an overlay or a highlighted
 * cell.
 *
 * For any point strictly inside a cell — and, by the half-open convention
 * `cellAtImageFraction` floors to, for a point on the cell's low-x/low-y
 * boundary too — `cellRectInImageFractions(cellAtImageFraction(fx, fy, …))`
 * produces a rect containing `(fx, fy)`.
 *
 * Degenerate calibration/image inputs (see `gridExtent`) return a
 * zero-sized rect at the origin, since no cell size can be computed.
 */
export function cellRectInImageFractions(
  key: CellKey,
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): ImageFractionRect {
  if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0 || calibration.cells_per_image_width <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const [mapX, mapY] = parseCellKey(key);
  const origin = resolveOriginCell(calibration);
  const imageCellX = mapX - origin.x;
  const imageCellY = mapY - origin.y;

  const cellWFrac = 1 / calibration.cells_per_image_width;
  const cellHFrac = cellWFrac * (imageNaturalWidth / imageNaturalHeight);

  return {
    x: calibration.origin_x_pct + imageCellX * cellWFrac,
    y: calibration.origin_y_pct + imageCellY * cellHFrac,
    w: cellWFrac,
    h: cellHFrac,
  };
}
