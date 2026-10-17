// What stops light and sight on a map (epic #1073 story 6): walls, closed doors, sluices (a solid gate) and solid
// rock. An open door and a grate (bars you can see through) do not. A line between two points is clear when it
// crosses no blocking edge and enters no solid cell.
//
// Edges are named as the Cartographer stores them, NW-owned: `"x,y:N"` is the top edge of cell (x,y), `"x,y:W"` its
// left edge. Pure and DOM-free; the same test serves the editor's preview and the live battle map.

import type { MapLive } from "@/types/mapLive.types";

export interface Occluders {
  /** Blocking edges, `"x,y:N"` or `"x,y:W"`. */
  walls: ReadonlySet<string>;
  /** Solid cells, `"x,y"`. */
  solid: ReadonlySet<string>;
  /** The same sets as numbers, so a line walk does no string work. Built by `occluders`. */
  readonly index: {
    north: ReadonlySet<number>;
    west: ReadonlySet<number>;
    solid: ReadonlySet<number>;
    empty: boolean;
  };
}

export interface OccluderInput {
  /** Edges that always block (walls, sluices). */
  walls: readonly string[];
  /** Door edges; a door blocks while it is not open. */
  doors: readonly { edge: string; open: boolean }[];
  solid: readonly string[];
}

const OFFSET = 1 << 15;
const SPAN = 1 << 16;
/** A cell (or edge owner) as one number; coordinates stay well inside +-32768 cells. */
const num = (x: number, y: number): number => (x + OFFSET) * SPAN + (y + OFFSET);

function parseCell(key: string): [number, number] {
  const [xs, ys] = key.split(",");
  return [Number(xs), Number(ys)];
}

export function occluders(input: OccluderInput): Occluders {
  const blocking = [...input.walls, ...input.doors.filter((d) => !d.open).map((d) => d.edge)];
  const walls = new Set(blocking);
  const solid = new Set(input.solid);
  const north = new Set<number>();
  const west = new Set<number>();
  for (const edge of walls) {
    const [cell, side] = edge.split(":");
    const [x, y] = parseCell(cell);
    (side === "N" ? north : west).add(num(x, y));
  }
  const solidNum = new Set<number>();
  for (const key of solid) {
    const [x, y] = parseCell(key);
    solidNum.add(num(x, y));
  }
  return { walls, solid, index: { north, west, solid: solidNum, empty: walls.size === 0 && solid.size === 0 } };
}

/** Nothing blocks. */
export const NO_OCCLUDERS: Occluders = occluders({ walls: [], doors: [], solid: [] });

const bySnapshot = new WeakMap<MapLive, Occluders>();
/** A snapshot's occluders, built once per snapshot object (doors at their drawn state). */
export function occludersOf(live: MapLive): Occluders {
  let built = bySnapshot.get(live);
  if (!built) {
    built = occluders({ walls: live.walls, doors: live.doors, solid: live.solid });
    bySnapshot.set(live, built);
  }
  return built;
}

const CORNER_EPS = 1e-9;

/**
 * Whether light or sight passes from (ax,ay) to (bx,by), in cells. Walks the cells the segment crosses; false when it
 * crosses a blocking edge or enters a solid cell other than the one it starts in. A segment through a grid corner is
 * blocked when either way round the corner is, so light never leaks where two walls meet.
 */
export function clearLine(occ: Occluders, ax: number, ay: number, bx: number, by: number): boolean {
  const { north, west, solid, empty } = occ.index;
  if (empty) return true;
  const dx = bx - ax;
  const dy = by - ay;
  let x = Math.floor(ax);
  let y = Math.floor(ay);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const tDeltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ax : ax - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - ay : ay - y) * tDeltaY;
  for (;;) {
    const t = Math.min(tMaxX, tMaxY);
    if (t >= 1) return true;
    const corner = Math.abs(tMaxX - tMaxY) < CORNER_EPS;
    if (corner) {
      const kx = sx > 0 ? x + 1 : x;
      const ky = sy > 0 ? y + 1 : y;
      if (
        west.has(num(kx, y)) ||
        west.has(num(kx, y + sy)) ||
        north.has(num(x, ky)) ||
        north.has(num(x + sx, ky)) ||
        solid.has(num(x + sx, y + sy)) ||
        solid.has(num(x + sx, y)) ||
        solid.has(num(x, y + sy))
      ) {
        return false;
      }
      x += sx;
      y += sy;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      if (west.has(num(sx > 0 ? x + 1 : x, y))) return false;
      x += sx;
      if (solid.has(num(x, y))) return false;
      tMaxX += tDeltaX;
    } else {
      if (north.has(num(x, sy > 0 ? y + 1 : y))) return false;
      y += sy;
      if (solid.has(num(x, y))) return false;
      tMaxY += tDeltaY;
    }
  }
}

/** How far off an edge a nudged origin sits, in cells. */
const NUDGE = 1e-3;
const onLine = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-6;

/**
 * Where a source at (x,y) shines from. A point on a cell edge (a wall fitting's light sits on its edge) is a hair off
 * the edge on each side, so it lights the face it hangs on and each side is walled off from the other on its own.
 * A point on a grid corner (an even-sized prop's centre) gives the four cells around it. Any other point is itself.
 * The caller takes the brightest result.
 */
export function nudgedOrigins(x: number, y: number): [number, number][] {
  const xs = onLine(x) ? [Math.round(x) - NUDGE, Math.round(x) + NUDGE] : [x];
  const ys = onLine(y) ? [Math.round(y) - NUDGE, Math.round(y) + NUDGE] : [y];
  return xs.flatMap((px) => ys.map((py): [number, number] => [px, py]));
}
