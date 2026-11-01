// Rooms found from the walls, as faces of the wall graph (epic #1125, frame 17: "all maps should be graphs/vectors").
// A room is a closed loop of the lines that bound it: lattice walls, angled walls, doors, and the plain edge of a floor square where floor meets nothing and no wall stands. Its `cells` are
// then the squares whose middle falls inside that loop, the rule the floor itself follows, so squares, fog and token
// footprints keep working underneath while the outline is what is drawn. Two rooms that share a wall share exactly
// that line, because it is the same segment in the graph.
//
// What cuts a room matches the flood fill this replaced: every wall of any type, doors and arches included.

import type { CellKey, DungeonMapLayers, WallEdge } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";
import { canonicaliseEdge, type Side } from "./edges";
import { isLatticeKey, wallSegment } from "./wallGraph";
import { cachedWallGeometry } from "./wallGeometry";
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

/** How far a bucketed neighbour may lie and still be compared when welding (cells). */
const JOIN = 0.6;

type Seg = {
  a: [number, number];
  b: [number, number];
  kind: "lattice" | "edge" | "angled";
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
function collectSegments(layers: DungeonMapLayers): Seg[] {
  const segs: Seg[] = [];
  const wallKeys = Object.keys(layers.walls).sort();
  const geometry = cachedWallGeometry(layers.walls);
  for (const key of wallKeys) {
    if (isLatticeKey(key)) {
      const s = wallSegment(key, layers.walls[key]);
      segs.push({ a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]], kind: "lattice" });
      continue;
    }
    // A wall that curves through a smooth node closes the room along the curve, piece by piece.
    for (const p of geometry.lines.get(key)?.pieces ?? []) {
      if (!samePt(p.a, p.b)) segs.push({ a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]], kind: "angled" });
    }
  }

  // A square's edge facing nothing bounds it, unless a wall already stands there.
  const seen = new Set<string>(wallKeys);
  const floorKeys = Object.keys(layers.floor).sort();
  for (const k of floorKeys) {
    const [x, y] = k.split(",").map(Number);
    if (!isOpenFloor(layers, x, y)) continue;
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

  return segs;
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

/** Cuts segments where they meet, so the pieces share end points. */
function weld(segs: Seg[]): Seg[] {
  const cuts: Pt[][] = segs.map(() => []);

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

  // Angled walls are the pieces that can meet others mid-way; lattice pieces only meet at corners.
  const done = new Set<string>();
  segs.forEach((s, i) => {
    if (s.kind !== "angled") return;
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]));
    const x1 = Math.floor(Math.max(s.a[0], s.b[0]));
    const y0 = Math.floor(Math.min(s.a[1], s.b[1]));
    const y1 = Math.floor(Math.max(s.a[1], s.b[1]));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      for (const j of buckets.get(`${x},${y}`) ?? []) {
        if (j === i) continue;
        const t = segs[j];
        const id = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (done.has(id)) continue;
        done.add(id);
        const m = meet(s.a, s.b, t.a, t.b);
        if (m.kind === "cross") {
          cuts[i].push(m.point);
          cuts[j].push(m.point);
        } else if (m.kind === "touch-ab") cuts[i].push(m.point);
        else if (m.kind === "touch-cd") cuts[j].push(m.point);
        else if (m.kind === "overlap" && t.kind === "edge") {
          // A floor edge lying along an angled wall: cut it where the wall's ends fall, so the covered stretch can go.
          for (const q of [s.a, s.b]) if (projectOnSegment(q, t.a, t.b).dist < WELD) cuts[j].push([q[0], q[1]]);
        }
      }
    }
  });

  const out: Seg[] = [];
  segs.forEach((s, i) => {
    const along = (q: Pt): number => (q[0] - s.a[0]) * (s.b[0] - s.a[0]) + (q[1] - s.a[1]) * (s.b[1] - s.a[1]);
    const points = [s.a as Pt, ...cuts[i], s.b as Pt].sort((p, q) => along(p) - along(q));
    for (let k = 0; k + 1 < points.length; k++) {
      if (samePt(points[k], points[k + 1])) continue;
      out.push({ a: [clean(points[k][0]), clean(points[k][1])], b: [clean(points[k + 1][0]), clean(points[k + 1][1])], kind: s.kind, ...(s.out ? { out: s.out } : {}) });
    }
  });
  // A floor edge that lies on an angled wall is that wall's line, not a second one: left in, it doubles the line the
  // face walk has to follow and a closed loop of angled walls over floor yields no face.
  const angled = out.filter((s) => s.kind === "angled");
  const onAngled = (q: Pt): boolean => angled.some((w) => projectOnSegment(q, w.a, w.b).dist < WELD);
  return out.filter((s) => s.kind !== "edge" || !(onAngled(s.a) && onAngled(s.b) && onAngled([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2])));
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
  const pieces = enclosedVoidsJoinRooms(weld(collectSegments(layers)));
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
