// Rooms found from the walls, as faces of the wall graph (epic #1125, frame 17: "all maps should be graphs/vectors").
// A room is a closed loop of the lines that bound it: lattice walls, angled walls, doors, the stroked curve of a
// brushed area, and the plain edge of a floor square where floor meets nothing and no wall stands. Its `cells` are
// then the squares whose middle falls inside that loop, the rule the floor itself follows, so squares, fog and token
// footprints keep working underneath while the outline is what is drawn. Two rooms that share a wall share exactly
// that line, because it is the same segment in the graph.
//
// What cuts a room matches the flood fill this replaced: every wall of any type, doors and arches included.

import type { CellKey, DungeonMapLayers, WallEdge } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";
import { cachedAreaLoops } from "./area";
import { canonicaliseEdge, type Side } from "./edges";
import { wallSegment } from "./wallGraph";
import { buildGraph } from "./wallEdit/graph";
import { detectRooms, floorCellsOf } from "./wallEdit/rooms";
import { clean, meet, projectOnSegment, samePt, WELD, type Pt } from "./wallEdit/geometry";
import { latticeKey } from "@/lib/battlemap/walls";
import { pointInRing } from "@/lib/locations/polygon";

export interface FoundFace {
  /** Open floor squares whose middle lies in the outline (and in no smaller room inside it). */
  cells: CellKey[];
  /** The loop in cell units, collinear points dropped. */
  outline: GridPoint[];
}

/** How far a stroked curve may stop short of the walls and floor edges it meets and still be joined to them (cells). */
const JOIN = 0.6;

type Seg = {
  a: [number, number];
  b: [number, number];
  kind: "lattice" | "edge" | "angled" | "curve";
  /** A floor edge's outward direction (towards the void it faces). */
  out?: [number, number];
};

function isOpenFloor(layers: DungeonMapLayers, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (layers.solidBlock[k]) return false;
  return layers.floor[k]?.floor !== undefined;
}

const SIDES: readonly [dx: number, dy: number, side: Side][] = [
  [0, -1, "N"],
  [1, 0, "E"],
  [0, 1, "S"],
  [-1, 0, "W"],
];

/** Every line a room can be bounded by, before the pieces are cut where they meet. */
function collectSegments(layers: DungeonMapLayers): { segs: Seg[]; runEnds: Pt[] } {
  const segs: Seg[] = [];
  const wallKeys = Object.keys(layers.walls).sort();
  for (const key of wallKeys) {
    const s = wallSegment(key, layers.walls[key]);
    if (samePt(s.a, s.b)) continue;
    const lattice = key.includes(":");
    segs.push({ a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]], kind: lattice ? "lattice" : "angled" });
  }

  // A square's edge facing nothing bounds it, unless a wall already stands there. Brushed squares are bounded by
  // the curve instead, which is the line the player sees.
  const seen = new Set<string>(wallKeys);
  const floorKeys = Object.keys(layers.floor).sort();
  for (const k of floorKeys) {
    const [x, y] = k.split(",").map(Number);
    if (!isOpenFloor(layers, x, y) || layers.area[k as CellKey] !== undefined) continue;
    for (const [dx, dy, side] of SIDES) {
      if (isOpenFloor(layers, x + dx, y + dy)) continue;
      const o = canonicaliseEdge(x, y, side);
      const key = latticeKey(o.x, o.y, o.side);
      if (seen.has(key)) continue;
      seen.add(key);
      const a: [number, number] = [o.x, o.y];
      segs.push({ a, b: o.side === "N" ? [o.x + 1, o.y] : [o.x, o.y + 1], kind: "edge", out: [dx, dy] });
    }
  }

  const runEnds: Pt[] = [];
  for (const loop of cachedAreaLoops(layers)) {
    if (holdsFloor(layers, loop.points)) continue;
    const n = loop.points.length;
    for (let i = 0; i < n; i++) {
      if (!loop.stroke[i]) continue;
      const a = loop.points[i];
      const b = loop.points[(i + 1) % n];
      segs.push({ a: [clean(a[0]), clean(a[1])], b: [clean(b[0]), clean(b[1])], kind: "curve" });
      if (!loop.stroke[(i + n - 1) % n]) runEnds.push(a);
      if (!loop.stroke[(i + 1) % n]) runEnds.push(b);
    }
  }
  return { segs, runEnds };
}

/**
 * A loop that goes round a hole (its covered side faces outwards) which still holds open floor is the brushed
 * mask being thinner than the floor drawn over it, not a wall: floor cells with an area entry that covers less than
 * half of them. Left in, it would wall that floor off as a room of its own.
 */
function holdsFloor(layers: DungeonMapLayers, points: readonly [number, number][]): boolean {
  // Outer loops run with the covered side on the left (y down), which makes their signed area negative.
  let twice = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    twice += p[0] * q[1] - q[0] * p[1];
  });
  if (twice <= 0) return false;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      if (isOpenFloor(layers, x, y) && pointInRing(x + 0.5, y + 0.5, points)) return true;
    }
  }
  return false;
}

/** Whether the segment runs through the inside of the square, not just along its edge or past its corner. */
const EPS = 1e-6;

export function crossesSquare(a: readonly number[], b: readonly number[], x: number, y: number): boolean {
  // Liang-Barsky on the open square; the clipped length must be more than a point.
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges: [number, number][] = [
    [-dx, a[0] - x],
    [dx, x + 1 - a[0]],
    [-dy, a[1] - y],
    [dy, y + 1 - a[1]],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < EPS) {
      if (q <= EPS) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 >= t1 - EPS) return false;
  }
  return t1 - t0 > EPS;
}

const bucketOf = (x: number, y: number): string => `${Math.floor(x)},${Math.floor(y)}`;

/** Cuts segments where they meet or where a curve stops just short, so the pieces share end points. */
function weld(segs: Seg[], runEnds: readonly Pt[]): Seg[] {
  const cuts: Pt[][] = segs.map(() => []);
  const extra: Seg[] = [];

  // Bucket by the squares a segment's box touches, so only neighbours are compared.
  const buckets = new Map<string, number[]>();
  segs.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) - JOIN);
    const x1 = Math.floor(Math.max(s.a[0], s.b[0]) + JOIN);
    const y0 = Math.floor(Math.min(s.a[1], s.b[1]) - JOIN);
    const y1 = Math.floor(Math.max(s.a[1], s.b[1]) + JOIN);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const list = buckets.get(`${x},${y}`);
      if (list) list.push(i);
      else buckets.set(`${x},${y}`, [i]);
    }
  });

  // Angled walls and curves are the pieces that can meet others mid-way; lattice pieces only meet at corners.
  const done = new Set<string>();
  segs.forEach((s, i) => {
    if (s.kind !== "angled" && s.kind !== "curve") return;
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]));
    const x1 = Math.floor(Math.max(s.a[0], s.b[0]));
    const y0 = Math.floor(Math.min(s.a[1], s.b[1]));
    const y1 = Math.floor(Math.max(s.a[1], s.b[1]));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      for (const j of buckets.get(`${x},${y}`) ?? []) {
        if (j === i) continue;
        const t = segs[j];
        if (s.kind === "curve" && (t.kind === "curve" || t.kind === "edge")) continue;
        const id = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (done.has(id)) continue;
        done.add(id);
        const m = meet(s.a, s.b, t.a, t.b);
        if (m.kind === "cross") {
          cuts[i].push(m.point);
          cuts[j].push(m.point);
        } else if (m.kind === "touch-ab") cuts[i].push(m.point);
        else if (m.kind === "touch-cd") cuts[j].push(m.point);
      }
    }
  });

  // A curve's end that touches nothing is pulled to the nearest line within reach, so the room closes.
  const id = (q: Pt): string => `${clean(q[0])},${clean(q[1])}`;
  const nodes = new Set(segs.flatMap((s, i) => (s.kind === "curve" ? [] : [id(s.a), id(s.b), ...cuts[i].map(id)])));
  for (const end of runEnds) {
    const p: Pt = [clean(end[0]), clean(end[1])];
    if (nodes.has(id(p))) continue;
    let best: { i: number; foot: [number, number]; d: number } | undefined;
    for (const i of buckets.get(bucketOf(p[0], p[1])) ?? []) {
      const s = segs[i];
      if (s.kind === "curve") continue;
      const hit = projectOnSegment(p, s.a, s.b);
      if (hit.dist <= JOIN && (!best || hit.dist < best.d)) best = { i, foot: [clean(hit.foot[0]), clean(hit.foot[1])], d: hit.dist };
    }
    if (!best) continue;
    if (best.d > WELD) extra.push({ a: [p[0], p[1]], b: best.foot, kind: "curve" });
    cuts[best.i].push(best.foot);
  }

  const out: Seg[] = [...extra];
  segs.forEach((s, i) => {
    const along = (q: Pt): number => (q[0] - s.a[0]) * (s.b[0] - s.a[0]) + (q[1] - s.a[1]) * (s.b[1] - s.a[1]);
    const points = [s.a as Pt, ...cuts[i], s.b as Pt].sort((p, q) => along(p) - along(q));
    for (let k = 0; k + 1 < points.length; k++) {
      if (samePt(points[k], points[k + 1])) continue;
      out.push({ a: [clean(points[k][0]), clean(points[k][1])], b: [clean(points[k + 1][0]), clean(points[k + 1][1])], kind: s.kind, ...(s.out ? { out: s.out } : {}) });
    }
  });
  // A curve that runs along a wall for a stretch lies on the same two points as the wall: one line, the wall's.
  const at = (q: Pt): string => `${clean(q[0])},${clean(q[1])}`;
  const lineKey = (s: Seg): string => [at(s.a), at(s.b)].sort().join("|");
  const owned = new Set(out.filter((s) => s.kind !== "curve").map(lineKey));
  const seenCurve = new Set<string>();
  return out.filter((s) => {
    if (s.kind !== "curve") return true;
    const key = lineKey(s);
    if (owned.has(key) || seenCurve.has(key)) return false;
    seenCurve.add(key);
    return true;
  });
}

/** How far (cells) an outline point may sit off the line between its neighbours and still be dropped: far below what
 *  the eye or a square's middle can tell, but it takes a smoothed curve from hundreds of points to dozens. */
const FLATNESS = 0.02;

function flatten(points: readonly GridPoint[]): GridPoint[] {
  if (points.length < 8) return [...points];
  let far = 1;
  for (let i = 2; i < points.length; i++) {
    if (Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]) > Math.hypot(points[far][0] - points[0][0], points[far][1] - points[0][1])) far = i;
  }
  const keep = new Set<number>([0, far]);
  const walk = (lo: number, hi: number): void => {
    let worst = -1;
    let worstD = FLATNESS;
    for (let i = lo + 1; i < hi; i++) {
      const d = projectOnSegment(points[i], points[lo], points[hi]).dist;
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst < 0) return;
    keep.add(worst);
    walk(lo, worst);
    walk(worst, hi);
  };
  walk(0, far);
  const closed = [...points, points[0]];
  // Second half runs far..n-1 then back to 0 (index n).
  const walkClosed = (lo: number, hi: number): void => {
    let worst = -1;
    let worstD = FLATNESS;
    for (let i = lo + 1; i < hi; i++) {
      const d = projectOnSegment(closed[i], closed[lo], closed[hi]).dist;
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst < 0) return;
    keep.add(worst);
    walkClosed(lo, worst);
    walkClosed(worst, hi);
  };
  walkClosed(far, points.length);
  return points.filter((_, i) => keep.has(i));
}

/** Drops points on a straight run and out-and-back spurs, so an outline holds only its real corners. */
export function simplifyLoop(points: readonly GridPoint[]): GridPoint[] {
  let ring = points.map((p): GridPoint => [p[0], p[1]]);
  for (let changed = true; changed && ring.length >= 3; ) {
    changed = false;
    const next: GridPoint[] = [];
    for (let i = 0; i < ring.length; i++) {
      const prev = next.length > 0 ? next[next.length - 1] : ring[(i + ring.length - 1) % ring.length];
      const cur = ring[i];
      const nxt = ring[(i + 1) % ring.length];
      if (samePt(prev, cur)) {
        changed = true;
        continue;
      }
      const cross = (cur[0] - prev[0]) * (nxt[1] - cur[1]) - (cur[1] - prev[1]) * (nxt[0] - cur[0]);
      if (Math.abs(cross) < 1e-9) {
        changed = true;
        continue;
      }
      next.push(cur);
    }
    ring = next;
  }
  return flatten(ring);
}

/**
 * The rooms of a drawing: one per face of the wall graph that holds open floor. A square belongs to the smallest face
 * around its middle, so a closet walled inside a hall is its own room and the hall keeps the rest.
 */
/** How far (cells) to step off a piece to say which side of a wall it is on. */
const STEP = 0.01;

/**
 * A plain floor edge is a boundary only when no wall beyond it closes that void together with the room: the faces of
 * the walls alone are found first, and an edge whose far side lies inside a wall face that holds its near side is
 * dropped, so a pocket of void a wall closes off (the corner a diagonal cuts off a stepped floor) is part of the room.
 * A room open on that side, with no wall beyond, keeps closing along its floor edge.
 */
function enclosedVoidsJoinRooms(pieces: Seg[]): Seg[] {
  const rest = pieces.filter((s) => s.kind !== "edge");
  if (rest.length === pieces.length || rest.length === 0) return pieces;
  const walls: Record<string, WallEdge> = {};
  rest.forEach((s, i) => {
    walls[`w${i}`] = { type: "wall", pack_id: "", pack_version: 0, variant: 0, a: s.a, b: s.b };
  });
  const rings = detectRooms(buildGraph(walls)).map((f) => f.polygon);
  return pieces.filter((s) => {
    if (s.kind !== "edge" || !s.out) return true;
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    const near: Pt = [mx - s.out[0] * STEP, my - s.out[1] * STEP];
    const far: Pt = [mx + s.out[0] * STEP, my + s.out[1] * STEP];
    return !rings.some((ring) => pointInRing(near[0], near[1], ring) && pointInRing(far[0], far[1], ring));
  });
}

export function findFaces(layers: DungeonMapLayers): FoundFace[] {
  const { segs, runEnds } = collectSegments(layers);
  const pieces = enclosedVoidsJoinRooms(weld(segs, runEnds));
  const walls: Record<string, WallEdge> = {};
  pieces.forEach((s, i) => {
    walls[`f${i}`] = { type: "wall", pack_id: "", pack_version: 0, variant: 0, a: s.a, b: s.b };
  });
  const faces = detectRooms(buildGraph(walls)).sort((p, q) => p.area - q.area);

  const owner = new Map<CellKey, number>();
  const cellsOf: CellKey[][] = faces.map(() => []);
  faces.forEach((face, i) => {
    for (const k of floorCellsOf(face.polygon)) {
      const [x, y] = k.split(",").map(Number);
      if (!isOpenFloor(layers, x, y) || owner.has(k)) continue;
      owner.set(k, i);
      cellsOf[i].push(k);
    }
  });

  const out: FoundFace[] = [];
  faces.forEach((face, i) => {
    if (cellsOf[i].length === 0) return;
    out.push({ cells: cellsOf[i], outline: simplifyLoop(face.polygon) });
  });
  return out;
}
