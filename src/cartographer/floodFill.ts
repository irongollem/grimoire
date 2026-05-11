// Flood-fill helpers — used by:
//   - Fill bucket  : flood the contiguous floor region and paint each cell.
//   - Wrap walls   : flood the contiguous floor region and add edge walls
//                    on every edge that faces void.
//
// 4-way (N/E/S/W) only — no diagonals, matching DnD grid semantics.

import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import type { CellEdge } from "./edges";

export interface FloodFillOptions {
  /** Safety cap to prevent runaway fills on unbounded predicates. */
  maxCells?: number;
}

export function floodFill(
  startX: number,
  startY: number,
  matches: (x: number, y: number) => boolean,
  opts: FloodFillOptions = {},
): Set<CellKey> {
  const cap = opts.maxCells ?? 10_000;
  const visited = new Set<CellKey>();

  if (!matches(startX, startY)) return visited;

  const queue: Array<[number, number]> = [[startX, startY]];
  visited.add(cellKey(startX, startY));

  while (queue.length > 0 && visited.size < cap) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ] as const) {
      const k = cellKey(nx, ny);
      if (visited.has(k)) continue;
      if (!matches(nx, ny)) continue;
      visited.add(k);
      if (visited.size >= cap) break;
      queue.push([nx, ny]);
    }
  }

  return visited;
}

/**
 * Every cell-edge of `region` that faces non-region (void).
 * Returns non-canonical CellEdge records (the cell-and-side that *faces*
 * the void); the writer canonicalises before storing.
 */
export function boundaryEdges(region: ReadonlySet<CellKey>): CellEdge[] {
  const out: CellEdge[] = [];
  for (const key of region) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!region.has(cellKey(x, y - 1))) out.push({ x, y, side: "N" });
    if (!region.has(cellKey(x + 1, y))) out.push({ x, y, side: "E" });
    if (!region.has(cellKey(x, y + 1))) out.push({ x, y, side: "S" });
    if (!region.has(cellKey(x - 1, y))) out.push({ x, y, side: "W" });
  }
  return out;
}
