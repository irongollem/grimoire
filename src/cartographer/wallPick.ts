// Pointing at walls and lights in cell units (#1125 story 5): where a click snaps, and which angled wall or light a
// click is nearest to. Pure, no DOM.

import type { PlacedLight, WallEdge } from "@/types/dungeonMap.types";
import { isLatticeKey } from "@/cartographer/wallGraph";

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
  for (const [id, wall] of Object.entries(walls)) {
    if (isLatticeKey(id)) continue;
    const d = distanceToSegment(p, wall.a, wall.b);
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
