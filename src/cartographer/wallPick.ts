// Pointing at walls and lights in cell units (#1125 story 5): where a click snaps, and which angled wall or light a
// click is nearest to. Pure, no DOM.

import type { PlacedLight, WallEdge } from "@/types/dungeonMap.types";
import { isLatticeKey } from "@/cartographer/wallGraph";
import { cachedWallGeometry } from "@/cartographer/wallGeometry";
import { SNAP_TOLERANCE } from "@/cartographer/wallEdit/snap";

export type CellPoint = [number, number];

/** How near a click must be to an angled wall to pick it, in cells (#1125 story 5). */
export const WALL_PICK_RADIUS = 0.3;
/** How near a click must be to a placed light to pick it up, in cells. */
export const LIGHT_PICK_RADIUS = 0.4;

/** A click's cell point snapped to the nearest grid intersection or half-cell; `free` (Alt) keeps it exactly. */
export function snapPoint(point: CellPoint, free: boolean): CellPoint {
  if (free) return [point[0], point[1]];
  return [Math.round(point[0] * 2) / 2, Math.round(point[1] * 2) / 2];
}

/** What a run point landed on: the run's own first point, the end of a wall already drawn, the grid, or nothing (Alt). */
export type RunSnapKind = "start" | "wall-end" | "grid" | "free";

/** How near the pointer must be to a wall end or the run's start to snap to it, in cells. This is the node drag's
 *  reach (`SNAP_TOLERANCE`, 0.25 cells, wallEdit/snap.ts), which is also in cells, so no zoom factor is needed. */
export const RUN_SNAP_REACH = SNAP_TOLERANCE;

/** A run needs three points placed before a click on the first one can close it: with two, "closing" would lay a
 *  second wall back over the first. */
export const MIN_POINTS_TO_CLOSE = 3;

/**
 * Where a point of the Angled wall run lands (Trace the walls, frame 02): the run's own first point (so the next
 * click closes the ring), else the end of any wall already drawn, else the half-cell grid. Alt (`free`) snaps to
 * nothing and keeps the exact point.
 */
export function snapRunPoint(
  frac: CellPoint,
  free: boolean,
  run: readonly CellPoint[],
  walls: Readonly<Record<string, WallEdge>>,
): { point: CellPoint; kind: RunSnapKind } {
  if (free) return { point: [frac[0], frac[1]], kind: "free" };
  const first = run[0];
  if (first && run.length >= MIN_POINTS_TO_CLOSE && Math.hypot(frac[0] - first[0], frac[1] - first[1]) <= RUN_SNAP_REACH) {
    return { point: [first[0], first[1]], kind: "start" };
  }
  let best: CellPoint | null = null;
  let bestDistance = RUN_SNAP_REACH;
  for (const wall of Object.values(walls)) {
    for (const end of [wall.a, wall.b]) {
      const d = Math.hypot(frac[0] - end[0], frac[1] - end[1]);
      if (d <= bestDistance) {
        best = [end[0], end[1]];
        bestDistance = d;
      }
    }
  }
  if (best) return { point: best, kind: "wall-end" };
  return { point: snapPoint(frac, false), kind: "grid" };
}

/** Whether `p` is exactly an end of some wall, for marking where a run has caught on. */
export function isWallEnd(walls: Readonly<Record<string, WallEdge>>, p: CellPoint): boolean {
  return Object.values(walls).some((w) => (w.a[0] === p[0] && w.a[1] === p[1]) || (w.b[0] === p[0] && w.b[1] === p[1]));
}

/** Distance from p to the segment a-b. */
export function distanceToSegment(p: CellPoint, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The angled wall nearest to `p` within `radius` cells, or null. A wall on a grid line is the grid tools' business. */
export function nearestAngledWall(
  walls: Readonly<Record<string, WallEdge>>,
  p: CellPoint,
  radius: number = WALL_PICK_RADIUS,
): string | null {
  let best: string | null = null;
  let bestDistance = radius;
  const geometry = cachedWallGeometry(walls);
  for (const id of Object.keys(walls)) {
    if (isLatticeKey(id)) continue;
    // The drawn line, which is a curve where the wall bends through a smooth node.
    const d = Math.min(...(geometry.lines.get(id)?.pieces ?? []).map((piece) => distanceToSegment(p, piece.a, piece.b)));
    if (d <= bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

/** The placed light nearest to `p` within `radius` cells, or null. */
export function nearestLight(
  lights: Readonly<Record<string, PlacedLight>>,
  p: CellPoint,
  radius: number = LIGHT_PICK_RADIUS,
): string | null {
  let best: string | null = null;
  let bestDistance = radius;
  for (const [id, light] of Object.entries(lights)) {
    const d = Math.hypot(p[0] - light.x, p[1] - light.y);
    if (d <= bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}
