// The shape maths behind Zoning's Lasso and round Brush (epic #1197, frame 05
// "A zone can be a cave"). A zone drawn by hand must look like what was drawn,
// so both tools produce a smoothed closed ring that is stored as the region's
// `vertices`; the squares it covers (`cellsInsideRing`) are derived from it
// afterwards, for fog, footprints and rules. Pure: no DOM, no Vue.
//
// A region holds ONE ring (no holes, no second loop), so every result here is
// reduced to its largest outer loop.

import { fitLoop } from "@/cartographer/brushWalls";
import { groundStrokeLoops } from "@/cartographer/groundRaster";
import type { Disc } from "@/cartographer/area";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";

/** A smaller enclosed area than one square holds no square, so it is no zone. */
const MIN_AREA = 1;

/** Absolute area of a ring, in squares (shoelace). */
export function ringArea(ring: readonly GridPoint[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

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

/**
 * What a brush stroke (round discs) does to a shape: unions it in, or carves it out when `erase`. The result is one
 * smoothed ring: the largest loop, since a region holds a single ring (a carve may split a zone; a stroke far from it
 * is a second blob). `[]` means nothing is left; `null` means the stroke changed nothing.
 */
export function strokeZoneRing(
  base: readonly (readonly GridPoint[])[],
  discs: readonly Disc[],
  erase: boolean,
  erasedCells: ReadonlySet<CellKey> = new Set(),
): GridPoint[] | null {
  const loops = groundStrokeLoops(base, discs, erase, erasedCells);
  if (loops === null) return null;
  return largestRing(loops);
}

function largestRing(loops: readonly GridPoint[][]): GridPoint[] {
  let best: GridPoint[] | null = null;
  let bestArea = 0;
  for (const loop of loops) {
    const area = ringArea(loop);
    if (area > bestArea) {
      best = loop;
      bestArea = area;
    }
  }
  const ring = best === null ? null : smoothed(best);
  return ring === null ? [] : ring;
}
