// The line gesture (epic #884 S7a, decision 6) — Cartographer-only before
// this story (`useMapCanvasEditor.ts`'s `cellsInLine` / `applyLine`). No
// Atlas equivalent existed to merge against.

import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";

/** Bresenham line between two cells, inclusive of both endpoints. */
export function cellsInLine(ax: number, ay: number, bx: number, by: number): CellKey[] {
  const out: CellKey[] = [];
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  const sx = ax <= bx ? 1 : -1, sy = ay <= by ? 1 : -1;
  let err = dx - dy;
  while (true) {
    out.push(cellKey(x, y));
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}
