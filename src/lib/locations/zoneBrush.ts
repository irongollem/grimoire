// The shape maths behind Zoning's Lasso and round Brush (epic #1197, frame 05
// "A zone can be a cave"). A zone drawn by hand must look like what was drawn,
// so both tools produce a smoothed closed ring that is stored as the region's
// `vertices`; the squares it covers (`cellsInsideRing`) are derived from it
// afterwards, for fog, footprints and rules. Pure: no DOM, no Vue.
//
// A region holds ONE ring (no holes, no second loop). A shape that is one piece
// is stored as that ring; a shape in several pieces is stored as its squares.

import { fitLoop } from "@/cartographer/brushWalls";
import { groundStrokeLoops } from "@/cartographer/groundRaster";
import type { Disc } from "@/cartographer/area";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";
import { pointInRing, ringArea } from "@/lib/locations/polygon";

/** A smaller enclosed area than one square holds no square, so it is no zone. */
const MIN_AREA = 1;
/** A piece or a hole this small holds no square's middle worth keeping. Half a square, not a whole one: a one-square
 *  hole (a pillar) traces to a hair under one square, and must still count as a hole. */
const MIN_PIECE_AREA = 0.5;

/** A loop reduced to the nodes a hand would put; `null` when nothing worth a zone is left. */
function smoothed(loop: readonly GridPoint[]): GridPoint[] | null {
  if (ringArea(loop) < MIN_AREA) return null;
  const fitted = fitLoop(loop);
  return fitted.length >= 3 && ringArea(fitted) >= MIN_AREA ? fitted : null;
}

/**
 * The hand's lasso as a zone ring: the dragged points closed and smoothed. `null` for fewer than three distinct
 * points or an enclosed area under one square (a click, a scribble).
 */
export function lassoRing(points: readonly GridPoint[]): GridPoint[] | null {
  const distinct = new Set(points.map((p) => `${p[0]},${p[1]}`));
  if (distinct.size < 3) return null;
  return smoothed(points);
}

/** The loops a region's current shape draws: its ring when it has one, else its squares traced as outlines. */
export function regionLoops(vertices: readonly GridPoint[] | null, cells: readonly CellKey[]): GridPoint[][] {
  if (vertices !== null) return [[...vertices]];
  if (cells.length === 0) return [];
  return groundStrokeLoops([], [], false, new Set(cells)) ?? [];
}

/** What a stroke leaves of a zone: one smooth ring, or (when it is in several parts, or has a hole) its squares. */
export type ZoneShape = { ring: GridPoint[] } | { cells: CellKey[] };

/** The squares whose middle lies inside the loops, counted even-odd so a loop inside another is a hole. */
function cellsInsideLoops(loops: readonly (readonly GridPoint[])[]): CellKey[] {
  const xs = loops.flatMap((loop) => loop.map((p) => p[0]));
  const ys = loops.flatMap((loop) => loop.map((p) => p[1]));
  const cells: CellKey[] = [];
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      const inside = loops.filter((loop) => pointInRing(x + 0.5, y + 0.5, loop)).length % 2 === 1;
      if (inside) cells.push(`${x},${y}` as CellKey);
    }
  }
  return cells;
}

/**
 * What a brush stroke (round discs) does to a shape: unions it in, or carves it out when `erase`.
 *
 * A region holds a single ring, so the result is a smoothed ring only when one piece with no hole is left. A zone in
 * two parts, one with a hole in it, a carve that cuts a zone in two, or a stroke that lands away from the zone is
 * kept whole as its squares instead: reducing it to its largest piece would silently delete the rest, far from
 * where the DM painted. Pieces under half a square are dropped either way.
 *
 * `{ cells: [] }` means nothing is left of a shape that was there; `null` means the stroke changed nothing, or made
 * nothing worth a zone where there was none.
 */
export function strokeZoneShape(
  base: readonly (readonly GridPoint[])[],
  discs: readonly Disc[],
  erase: boolean,
  erasedCells: ReadonlySet<CellKey> = new Set(),
): ZoneShape | null {
  const loops = groundStrokeLoops(base, discs, erase, erasedCells);
  if (loops === null) return null;
  const pieces = loops.filter((loop) => ringArea(loop) >= MIN_PIECE_AREA);
  if (pieces.length === 1) {
    const ring = smoothed(pieces[0]);
    if (ring) return { ring };
  } else if (pieces.length > 1) {
    return { cells: cellsInsideLoops(pieces) };
  }
  return base.length === 0 ? null : { cells: [] };
}
