// The rectangle gesture (epic #884 S7a, decision 6) — Cartographer-only
// before this story (`useMapCanvasEditor.ts`'s `cellsInRect` + `applyRect`).
// The Atlas has no rectangle tool, so there was nothing to merge here beyond
// giving the gesture a home other tools could reach if they ever need one.
//
// The Cartographer's rectangle tool carries a shift-held flag that also
// wraps the rectangle's perimeter in walls. That's a Cartographer-specific
// meaning (a layer with no walls has nothing to wrap), so the flag rides
// along in the result unused rather than being interpreted here — "a
// gesture produces cells; the active layer decides what those cells mean."

import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";

export interface RectangleStroke {
  readonly cells: readonly CellKey[];
  /** The shift-variant flag from the input event, passed through unused. */
  readonly variant: boolean;
}

/** All cells in the axis-aligned bounding box between two corners, inclusive. */
export function cellsInRect(ax: number, ay: number, bx: number, by: number): CellKey[] {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  const out: CellKey[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      out.push(cellKey(x, y));
  return out;
}

export function rectangleGesture(ax: number, ay: number, bx: number, by: number, variant: boolean): RectangleStroke {
  return { cells: cellsInRect(ax, ay, bx, by), variant };
}
