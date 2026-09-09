// Pure path/geometry builders for the composed player plan (#868 story S9,
// frame 16 "Fog and player view" of `atlas/Sites & Cartographer.html`).
//
// `PlayerSitePlan.vue` draws an SVG from cell sets the RPC already decided
// the player may see — this module only turns those cell sets into path
// data, rectangles and a viewBox. It knows nothing about colour, stroke
// width or the DM/player distinction; that is the component's job. Kept
// separate (and dependency-free beyond `cellSignature`) so the maths is
// testable without mounting Vue or touching Supabase.
//
// All units are grid cells, not pixels — the SVG scales itself with a
// `viewBox`, the same reason `dungeonMap.types.ts` keeps `CellKey` in cell
// space rather than image space.

import { canonicalCells } from "@/cartographer/cellSignature";
import type { CellKey } from "@/types/dungeonMap.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function parseCell(cell: CellKey): [number, number] {
  const [x, y] = cell.split(",").map(Number);
  return [x, y];
}

/** One 1×1 rect per cell, in grid units. Order follows `canonicalCells`. */
export function cellsRects(cells: readonly CellKey[]): CellRect[] {
  return canonicalCells(cells).map((cell) => {
    const [x, y] = parseCell(cell);
    return { x, y, w: 1, h: 1 };
  });
}

/**
 * The boundary of a cell set: one path segment per cell edge that has no
 * neighbour inside the set, expressed as absolute-moveto + relative-line SVG
 * path data (`M x y h 1` / `M x y v 1`). Deliberately one segment per
 * qualifying edge rather than merged runs — a lone cell yields 4 segments, a
 * 2×2 square yields 8 (each corner cell contributes its two outward edges),
 * which is exactly the perimeter of the shape and needs no further
 * simplification for an SVG renderer.
 *
 * `inset` pulls each edge inward (into the cell, perpendicular to the edge)
 * by that many grid units without shortening it — useful when a wide stroke
 * centred on the path would otherwise visually bleed into a neighbouring
 * cell that is outside the set.
 */
export function outlinePath(cells: readonly CellKey[], inset = 0): string {
  const canonical = canonicalCells(cells);
  const set = new Set(canonical);
  const segments: string[] = [];
  for (const cell of canonical) {
    const [x, y] = parseCell(cell);
    if (!set.has(`${x},${y - 1}` as CellKey)) segments.push(`M ${x} ${y + inset} h 1`);
    if (!set.has(`${x},${y + 1}` as CellKey)) segments.push(`M ${x} ${y + 1 - inset} h 1`);
    if (!set.has(`${x - 1},${y}` as CellKey)) segments.push(`M ${x + inset} ${y} v 1`);
    if (!set.has(`${x + 1},${y}` as CellKey)) segments.push(`M ${x + 1 - inset} ${y} v 1`);
  }
  return segments.join(" ");
}

/** The centre of mass of a cell set's own centres, for label placement. Null
 *  for an empty set — there is nothing to centre a label on. */
export function centroid(cells: readonly CellKey[]): [number, number] | null {
  const canonical = canonicalCells(cells);
  if (canonical.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const cell of canonical) {
    const [x, y] = parseCell(cell);
    sumX += x + 0.5;
    sumY += y + 0.5;
  }
  return [sumX / canonical.length, sumY / canonical.length];
}

/** The `sa-plan.js` texture pick: a sparse, deterministic subset of a floor
 *  so the explored floor reads as worn stone rather than a flat fill. */
export function textureCells(cells: readonly CellKey[]): CellKey[] {
  return canonicalCells(cells).filter((cell) => {
    const [x, y] = parseCell(cell);
    return (x * 7 + y * 13) % 5 === 0;
  });
}

/**
 * The grid-unit segment a door's `source_edge_key` names. `"x,y:N"` is the
 * top of cell (x,y), from (x,y) to (x+1,y); `"x,y:W"` is its left side, from
 * (x,y) to (x,y+1) — the same NW ownership `src/cartographer/edges.ts` and
 * `LocationDoor.source_edge_key` use.
 *
 * `inset` shortens the bar symmetrically from both ends (so it reads as a
 * gap in the wall rather than a full wall-length stroke); 0 draws the full
 * cell edge.
 */
export function edgeSegment(edgeKey: SourceEdgeKey, inset = 0): EdgeSegment {
  const [coords, side] = edgeKey.split(":");
  const [x, y] = coords.split(",").map(Number);
  if (side === "N") {
    return { x1: x + inset, y1: y, x2: x + 1 - inset, y2: y };
  }
  return { x1: x, y1: y + inset, x2: x, y2: y + 1 - inset };
}

/**
 * The bounds of everything the composed plan draws, plus padding, as an SVG
 * `viewBox`. There is no baked image to size against any more (that is the
 * "one honest limit" frame 16 closes), so the plan sizes itself from its own
 * geometry — every cell set that will be drawn, explored and glimpsed alike.
 * Null when nothing is drawn at all.
 */
export function planViewBox(cellSets: readonly (readonly CellKey[])[], padding = 1): PlanViewBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cells of cellSets) {
    for (const cell of cells) {
      const [x, y] = parseCell(cell);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding,
  };
}
