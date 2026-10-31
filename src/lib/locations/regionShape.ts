// The shape a region is drawn in. A room found from the walls carries the outline of the lines that bound it
// (`vertices`, see `cartographer/roomOutline.ts`), so everything that draws a region fills and strokes that ring and
// keeps the squares for what counts squares (fog by room, footprints, explore seating). A region with no ring, or one
// whose squares are being edited right now (`cellsOverride`), is drawn as its squares, as before.

import { pointInRing, ringBounds } from "@/lib/locations/polygon";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

/** The ring to draw, or null when there is none worth drawing (fewer than three corners). */
export function usableRing(vertices: readonly GridPoint[] | null | undefined): readonly GridPoint[] | null {
  return vertices && vertices.length >= 3 ? vertices : null;
}

/** The ring a region is drawn by: its own, unless a stroke in flight has replaced its squares. */
export function drawnRing(region: Pick<LocationMapRegion, "id" | "vertices">, cellsOverride: ReadonlyMap<string, unknown> | undefined): readonly GridPoint[] | null {
  return cellsOverride?.has(region.id) ? null : usableRing(region.vertices);
}

/** An SVG path (`d`) for a ring. */
export function ringPathD(ring: readonly GridPoint[]): string {
  return `${ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ")} Z`;
}

/** Adds the ring as a closed sub-path of the current canvas path (the caller begins, fills, strokes or clips it). */
export function tracePath(ctx: Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "closePath">, points: readonly { x: number; y: number }[]): void {
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

const ringArea = (ring: readonly GridPoint[]): number => {
  const b = ringBounds(ring);
  return b ? (b.maxX - b.minX) * (b.maxY - b.minY) : Infinity;
};

const clipCache = new WeakMap<readonly CellKey[], { rooms: readonly LocationMapRegion[]; ring: readonly GridPoint[] | null }>();

/**
 * The outline of the smallest room that holds all of a cells-only region (a zone painted with the Brush), or null.
 * Such a zone is drawn clipped to it, so a zone over a round chapel stops at the curve instead of showing squares
 * poking past it.
 */
export function enclosingRing(
  cells: readonly CellKey[],
  region: Pick<LocationMapRegion, "id">,
  rooms: readonly LocationMapRegion[],
): readonly GridPoint[] | null {
  if (cells.length === 0) return null;
  const hit = clipCache.get(cells);
  if (hit && hit.rooms === rooms) return hit.ring;
  let best: readonly GridPoint[] | null = null;
  for (const room of rooms) {
    const ring = room.region_role === "space" && room.id !== region.id ? usableRing(room.vertices) : null;
    if (!ring || (best && ringArea(ring) >= ringArea(best))) continue;
    const all = cells.every((c) => {
      const [x, y] = c.split(",").map(Number);
      return pointInRing(x + 0.5, y + 0.5, ring);
    });
    if (all) best = ring;
  }
  clipCache.set(cells, { rooms, ring: best });
  return best;
}
