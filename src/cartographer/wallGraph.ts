// The Drawing's walls as one segment graph (epic #1125 decision 5): `layers.walls` holds lattice walls (on a grid line,
// keyed by edge key) and angled ones (keyed by uuid) side by side. Everything that used to read `wallN` / `wallW` off a
// floor cell reads through here, so a reader asks "what wall is on this edge" or "give me every segment" and never
// cares which kind it is. Pure and DOM-free.

import type { DungeonMapLayers, EdgeSeg, WallEdge } from "@/types/dungeonMap.types";
import { latticeKey, latticeSegment, type Point, type WallSegment } from "@/lib/battlemap/walls";
import { canonicaliseEdge, type CanonicalSide, type Side } from "@/cartographer/edges";

/** A lattice wall's key names its edge (`"x,y:N"`); an angled wall's is a uuid, which has no colon. */
export function isLatticeKey(key: string): boolean {
  return key.includes(":");
}

/** The wall on the edge of cell (x,y) at `side`, whichever neighbour owns it under NW ownership. */
export function wallAt(layers: DungeonMapLayers, x: number, y: number, side: Side): WallEdge | undefined {
  const owner = canonicaliseEdge(x, y, side);
  return layers.walls[latticeKey(owner.x, owner.y, owner.side)];
}

/** The wall stored on the canonical edge `side` of cell (x,y), if any (no neighbour lookup: the cell owns it). */
export function ownedWall(layers: DungeonMapLayers, x: number, y: number, side: CanonicalSide): WallEdge | undefined {
  return layers.walls[latticeKey(x, y, side)];
}

/** Whether a wall is painted into a bake: `visible: false` walls still block sight and light but leave no mark. */
export function isDrawn(wall: WallEdge | undefined): wall is WallEdge {
  return wall !== undefined && wall.visible !== false;
}

/** The plain pack-edge data of a wall, without the geometry and visibility the segment graph adds. */
export function edgeSegOf(wall: WallEdge): EdgeSeg {
  const { a: _a, b: _b, visible: _visible, smoothA: _smoothA, smoothB: _smoothB, ...seg } = wall;
  return seg;
}

/** A lattice wall for the canonical edge (x,y,side) carrying `seg`; its line comes from the key. */
export function latticeWall(x: number, y: number, side: CanonicalSide, seg: EdgeSeg, visible?: boolean): WallEdge {
  const { a, b } = latticeSegment(latticeKey(x, y, side));
  return { ...seg, a: [a[0], a[1]], b: [b[0], b[1]], ...(visible === false ? { visible } : {}) };
}

export interface LatticeEntry {
  key: string;
  x: number;
  y: number;
  side: CanonicalSide;
  wall: WallEdge;
}

/** Every wall on a grid line, with its owner cell and side parsed from the key. */
export function latticeWalls(layers: DungeonMapLayers): LatticeEntry[] {
  const out: LatticeEntry[] = [];
  for (const [key, wall] of Object.entries(layers.walls)) {
    if (!isLatticeKey(key)) continue;
    const [cell, side] = key.split(":");
    const [xs, ys] = cell.split(",");
    out.push({ key, x: Number(xs), y: Number(ys), side: side === "N" ? "N" : "W", wall });
  }
  return out;
}

/** Every wall that is not on a grid line, by id. */
export function angledWalls(layers: DungeonMapLayers): [id: string, wall: WallEdge][] {
  return Object.entries(layers.walls).filter(([key]) => !isLatticeKey(key));
}

/** A wall as the segment sight and light test. A lattice wall's line comes from its key, an angled wall's from a/b. */
export function wallSegment(id: string, wall: WallEdge): WallSegment {
  return isLatticeKey(id) ? latticeSegment(id) : { id, a: wall.a, b: wall.b };
}

/** Whether a wall of this type stops sight and light. A door stands in for one; `grate` lets sight through. */
export function blocksSight(wall: EdgeSeg): boolean {
  return wall.type === "wall" || wall.type === "sluice";
}

const EPS = 1e-9;
const cross = (o: Point, p: Point, q: Point): number => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
const sign = (v: number): number => (v > EPS ? 1 : v < -EPS ? -1 : 0);

/**
 * Whether the wall a-b cuts the grid edge p-q that two neighbouring cells share. A wall lying along the edge cuts it,
 * and so does one crossing it or ending inside it; a wall that only touches p or q (ending at the corner) does not,
 * so it never splits cells it does not actually pass between.
 */
export function wallCutsEdge(a: Point, b: Point, p: Point, q: Point): boolean {
  const d1 = sign(cross(p, q, a));
  const d2 = sign(cross(p, q, b));
  if (d1 === 0 && d2 === 0) {
    // Collinear: it cuts only when the two overlap for some length, not just at a shared end point.
    const axis = p[0] !== q[0] ? 0 : 1;
    const lo = Math.max(Math.min(p[axis], q[axis]), Math.min(a[axis], b[axis]));
    const hi = Math.min(Math.max(p[axis], q[axis]), Math.max(a[axis], b[axis]));
    return hi - lo > EPS;
  }
  const e1 = sign(cross(a, b, p));
  const e2 = sign(cross(a, b, q));
  return e1 * e2 < 0 && d1 * d2 <= 0;
}
