// Grid maths for the site map viewer (#784, epic #780; re-anchored to the
// map image in #805).
//
// The grid is no longer derived from whatever has been painted or traced —
// see `src/lib/gridCalibration.ts` for the image-anchored maths that
// replaced that. What's left here is smaller and image-agnostic: toggling a
// cell in a region's cell list, and deciding whether a cell the calibration
// maps to is actually one of the whole cells laid across the image (as
// opposed to a partial cell hanging off the grid's origin or its far edge).
//
// Deliberately free of Vue, DOM and canvas so it can be unit tested without a
// browser. `SiteMapView.vue` is the only consumer.

import { gridExtent } from "@/lib/gridCalibration";
import { parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";

/**
 * Adds `key` to `cells` if absent, removes it if present. Pure; dedupes by
 * construction since a key already present is removed rather than
 * duplicated.
 */
export function toggleCell(cells: readonly CellKey[], key: CellKey): CellKey[] {
  return cells.includes(key) ? cells.filter((k) => k !== key) : [...cells, key];
}

/**
 * Whether `key` — a cell in map-cell space, i.e. already offset by
 * `calibration.origin_cell_x/y` — falls within the whole cells the
 * calibration actually lays across the image.
 *
 * `gridExtent`'s `cols`/`rows` round `cells_per_image_width` *up*, so the
 * calibrated grid can run slightly past the image's true pixel bounds on
 * its far edge, and a non-zero `origin_x_pct`/`origin_y_pct` can leave a
 * strip of image *before* the grid's own cell (0,0). A pointer stroke must
 * not create a region cell that hangs off a picture the DM can never see it
 * outlined on — this is the addressability test that keeps that from
 * happening. This is intentionally not part of `gridCalibration.ts`: that
 * module is owned by #806/#807's slices of #805 and this ticket only
 * consumes it, deriving the extra bit of bookkeeping (undoing the
 * `origin_cell_x/y` offset `cellAtImageFraction` already applied) it needs
 * from what that module already exports.
 */
export function isCellOnImageGrid(
  key: CellKey,
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): boolean {
  const { cols, rows } = gridExtent(calibration, imageNaturalWidth, imageNaturalHeight);
  if (cols <= 0 || rows <= 0) return false;

  const [mapX, mapY] = parseCellKey(key);
  const imageCellX = mapX - (calibration.origin_cell_x ?? 0);
  const imageCellY = mapY - (calibration.origin_cell_y ?? 0);
  return imageCellX >= 0 && imageCellX < cols && imageCellY >= 0 && imageCellY < rows;
}
