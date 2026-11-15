// A door is a stretch of the wall (#1197, frame 06 "A door on any wall"). The Zoning Door tool cuts one into the Drawing
// and writes its way out at the same click; these are the pure edits to the Drawing's `walls` it makes, and their
// inverses for Alt-click and the kind cycle. No DOM, no reactivity: the caller applies the result through one undo step.

import type { EdgeSegType, WallEdge } from "@/types/dungeonMap.types";
import { isLatticeKey } from "@/cartographer/wallGraph";
import type { CellPoint } from "@/cartographer/wallPick";

type Walls = Record<string, WallEdge>;

/** The two wall types a door takes: a door that closes, and an arch (an opening, drawn open). */
export type DoorWallType = "doorClosed" | "doorOpen";

/** A stretch of wall shorter than this is not worth a wall of its own: a door at the very end of a wall leaves none. */
export const MIN_REMAINDER = 0.05;

const isDoorType = (type: EdgeSegType): boolean => type === "doorClosed" || type === "doorOpen";

export const doorWallTypeOf = (kind: "door" | "arch"): DoorWallType => (kind === "arch" ? "doorOpen" : "doorClosed");

/**
 * Cuts a door, `from` to `to`, into the plain wall `wallId`.
 *
 * - A wall on a grid line is one 5 ft edge: the door is that edge, so its type is switched in place and the key stays
 *   (`from` and `to` are ignored).
 * - Any other wall becomes up to three: the stretch before the door (it keeps the original id, so whatever names the
 *   wall still names a wall, and the original `a` and `smoothA`), the door (a fresh key, `doorType`, straight, no
 *   smooth flags) and the stretch after (the original `b` and `smoothB`). A stretch shorter than `MIN_REMAINDER` is
 *   dropped and the door runs to the wall's end on that side; the original id then goes to whichever one is left. All three keep the original's material and
 *   visibility.
 * - A curved wall (one with a smooth flag) is cut at two points on its sampled line. The stretches either side run
 *   from the wall's own ends to the door as straight chords, so the curve flattens a little beside the door. That is an
 *   accepted small change of shape: the door is the thing the DM is placing.
 *
 * Null when the wall is gone or is not a plain wall (a door, a grate or a sluice is not cut again).
 */
export function cutDoorIntoWall(
  walls: Readonly<Walls>,
  wallId: string,
  from: CellPoint,
  to: CellPoint,
  newKey: () => string,
  doorType: DoorWallType = "doorClosed",
): { walls: Walls; doorId: string } | null {
  const wall = walls[wallId];
  if (!wall || wall.type !== "wall") return null;

  if (isLatticeKey(wallId)) return { walls: { ...walls, [wallId]: { ...wall, type: doorType } }, doorId: wallId };

  // Order the two points along the wall (a to b) so "before" and "after" mean what they say.
  const dx = wall.b[0] - wall.a[0];
  const dy = wall.b[1] - wall.a[1];
  const along = (p: CellPoint): number => (p[0] - wall.a[0]) * dx + (p[1] - wall.a[1]) * dy;
  const [first, second] = along(from) <= along(to) ? [from, to] : [to, from];

  const { smoothA, smoothB, ...base } = wall;
  const longEnough = (p: readonly [number, number], q: readonly [number, number]): boolean =>
    Math.hypot(q[0] - p[0], q[1] - p[1]) >= MIN_REMAINDER;

  const next: Walls = { ...walls };
  delete next[wallId];

  const before: WallEdge | null = longEnough(wall.a, first)
    ? { ...base, a: wall.a, b: [first[0], first[1]], ...(smoothA ? { smoothA } : {}) }
    : null;
  const after: WallEdge | null = longEnough(second, wall.b)
    ? { ...base, a: [second[0], second[1]], b: wall.b, ...(smoothB ? { smoothB } : {}) }
    : null;

  // Where a stretch is dropped the door runs to the wall's own end, or a sliver of nothing would be left beside it
  // for sight and movement to slip through.
  const doorA = before ? first : wall.a;
  const doorB = after ? second : wall.b;
  const doorId = newKey();
  next[doorId] = { ...base, type: doorType, a: [doorA[0], doorA[1]], b: [doorB[0], doorB[1]] };
  if (before) next[wallId] = before;
  if (after) next[before ? newKey() : wallId] = after;
  return { walls: next, doorId };
}

/** A door with no wall under it (#1196): a hidden door wall on its own line, which blocks and opens like any door but
 *  draws nothing, since the picture already shows the opening. `pack_id: ""` is the established "no tile set" for a
 *  hidden wall (`lib/mapImport/uvttImport.ts`). */
export function addFreeDoor(
  walls: Readonly<Walls>,
  from: CellPoint,
  to: CellPoint,
  newKey: () => string,
  doorType: DoorWallType = "doorClosed",
): { walls: Walls; doorId: string } {
  const doorId = newKey();
  const door: WallEdge = {
    type: doorType,
    a: [from[0], from[1]],
    b: [to[0], to[1]],
    visible: false,
    freeStanding: true,
    pack_id: "",
    pack_version: 0,
    variant: 0,
  };
  return { walls: { ...walls, [doorId]: door }, doorId };
}

/** Switches a door wall between door and arch. Null when `key` is not a door in the Drawing (the way is only a row). */
export function setDoorWallType(walls: Readonly<Walls>, key: string, type: DoorWallType): Walls | null {
  const wall = walls[key];
  if (!wall || !isDoorType(wall.type)) return null;
  return { ...walls, [key]: { ...wall, type } };
}

/**
 * The inverse of cutting: takes the door at `key` out of the Drawing. A door that was cut from a wall becomes a plain
 * wall again (same visibility); one drawn free across an opening (`freeStanding`, set by `addFreeDoor`) is deleted.
 * Null when `key` is not a door.
 */
export function removeDoorWall(walls: Readonly<Walls>, key: string): Walls | null {
  const wall = walls[key];
  if (!wall || !isDoorType(wall.type)) return null;
  if (!wall.freeStanding) return { ...walls, [key]: { ...wall, type: "wall" } };
  const next = { ...walls };
  delete next[key];
  return next;
}
