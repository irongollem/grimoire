// What stops light and sight on a map (epic #1073 story 6): walls, closed doors, sluices (a solid gate) and solid
// rock. An open door and a grate (bars you can see through) do not. A line between two points is clear when it
// meets no blocking wall and enters no solid cell.
//
// A wall is a segment between two points in cell units (#1125 decision 5); a wall on a grid line is the segment of its
// NW-owned edge key (`"x,y:N"`, `"x,y:W"`, see walls.ts). Pure and DOM-free; the same test serves the editor's preview
// and the live battle map.

import { effectiveDoors } from "@/lib/battlemap/doors";
import { buildSegmentIndex, cellNum, segmentsIntersect, type Point, type SegmentIndex, type WallSegment } from "@/lib/battlemap/walls";
import type { MapLive, MapLiveDoorState } from "@/types/mapLive.types";

export interface Occluders {
  /** Blocking segments: walls and the doors that are not open. */
  segments: readonly WallSegment[];
  /** Solid cells, `"x,y"`. */
  solid: ReadonlySet<string>;
  /** The same sets as numbers and buckets, so a line walk does no string work. Built by `occluders`. */
  readonly index: {
    segments: SegmentIndex;
    solid: ReadonlySet<number>;
    empty: boolean;
  };
}

export interface OccluderInput {
  /** Segments that always block (walls, sluices). */
  walls: readonly WallSegment[];
  /** Door segments; a door blocks while it is not open. */
  doors: readonly (WallSegment & { open: boolean })[];
  solid: readonly string[];
}

const num = cellNum;

function parseCell(key: string): [number, number] {
  const [xs, ys] = key.split(",");
  return [Number(xs), Number(ys)];
}

export function occluders(input: OccluderInput): Occluders {
  const segments = [...input.walls, ...input.doors.filter((d) => !d.open)];
  const solid = new Set(input.solid);
  const solidNum = new Set<number>();
  for (const key of solid) {
    const [x, y] = parseCell(key);
    solidNum.add(num(x, y));
  }
  return {
    segments,
    solid,
    index: { segments: buildSegmentIndex(segments), solid: solidNum, empty: segments.length === 0 && solid.size === 0 },
  };
}

/** Nothing blocks. */
export const NO_OCCLUDERS: Occluders = occluders({ walls: [], doors: [], solid: [] });

/** No door overrides: every door at its drawn state. Shared, so callers with none do not defeat the memo. */
export const NO_DOOR_STATES: readonly MapLiveDoorState[] = Object.freeze([]);

const bySnapshot = new WeakMap<MapLive, WeakMap<readonly MapLiveDoorState[], Occluders>>();
/**
 * A snapshot's occluders with the DM's door overrides laid over the drawn doors (#1073), built once per snapshot
 * object and override array. Keyed on the array's identity, so a caller must hand the same array while nothing changed.
 */
export function occludersOf(live: MapLive, doorStates: readonly MapLiveDoorState[] = NO_DOOR_STATES): Occluders {
  let perStates = bySnapshot.get(live);
  if (!perStates) {
    perStates = new WeakMap();
    bySnapshot.set(live, perStates);
  }
  let built = perStates.get(doorStates);
  if (!built) {
    built = occluders({ walls: live.walls, doors: effectiveDoors(live.doors, doorStates), solid: live.solid });
    perStates.set(doorStates, built);
  }
  return built;
}

const CORNER_EPS = 1e-9;
/** A ray ends this fraction short of its target: a wall the target sits exactly on does not hide it. */
const END_TRIM = 1e-6;

/**
 * Whether light or sight passes from (ax,ay) to (bx,by), in cells. Walks the cells the segment crosses; false when it
 * meets a blocking wall segment in one of them or enters a solid cell other than the one it starts in. Wall contact is
 * closed, so a segment through a grid corner is blocked when any wall ending at that corner is, and light never leaks
 * where two walls meet.
 */
export function clearLine(occ: Occluders, ax: number, ay: number, bx: number, by: number): boolean {
  const { segments, solid, empty } = occ.index;
  if (empty) return true;
  const dx = bx - ax;
  const dy = by - ay;
  const from: Point = [ax, ay];
  const to: Point = [ax + dx * (1 - END_TRIM), ay + dy * (1 - END_TRIM)];
  const hits = (cx: number, cy: number): boolean => {
    const list = segments.cells.get(num(cx, cy));
    if (!list) return false;
    for (const seg of list) if (segmentsIntersect(from, to, seg.a, seg.b)) return true;
    return false;
  };
  let x = Math.floor(ax);
  let y = Math.floor(ay);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const tDeltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ax : ax - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - ay : ay - y) * tDeltaY;
  for (;;) {
    if (hits(x, y)) return false;
    const t = Math.min(tMaxX, tMaxY);
    if (t >= 1) return true;
    const corner = Math.abs(tMaxX - tMaxY) < CORNER_EPS;
    if (corner) {
      // A wall ending at the corner is filed in all four cells around it (see `buildSegmentIndex`), so the two cells
      // the ray enters find it; only the rock on the flanks needs looking at.
      if (
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
      x += sx;
      if (solid.has(num(x, y))) return false;
      tMaxX += tDeltaX;
    } else {
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
