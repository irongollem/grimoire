// Rooms found from the walls, as faces of the wall graph (epic #1125, frame 17: "all maps should be graphs/vectors").
// A room is a closed loop of the lines that bound it: lattice walls, angled walls, doors, and, where floor meets
// nothing and no wall stands, the outline of the painted floor shape itself. Its `cells` are then the squares whose
// middle falls inside that loop, the rule the floor itself follows, so squares, fog and token footprints keep working
// underneath while the outline is what is drawn. Two rooms that share a wall share exactly that line, because it is
// the same segment in the graph.
//
// The floor's own outline bounds an unwalled room (maintainer, 14 Nov 2026: "even hand drawn maps convert the paint
// strokes into squares"). A brushed floor with Walls: None used to close along the edges of its squares, so the room
// found on a round cave was a staircase laid over a smooth floor. Only the OUTSIDE of the painted floor counts: a
// shoreline between two materials has floor on both sides and still never divides a room ("Editable material
// regions" in cartographer.md). A solid block is cut in squares, so its sides bound the floor it stands on; and a
// floor square that no shape covers keeps its plain square edge.
//
// What cuts a room matches the flood fill this replaced: every wall of any type, doors and arches included.

import type { CellKey, DungeonMapLayers, WallEdge } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";
import { canonicaliseEdge, type Side } from "./edges";
import { isLatticeKey, wallSegment } from "./wallGraph";
import { cachedWallGeometry } from "./wallGeometry";
import { groundLoops } from "./groundLoops";
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
  /** `edge` is the plain side of a floor square no shape covers. `ground` is a line that bounds a room only where
   *  painted floor lies on exactly one side of it: a piece of a floor shape's outline, or a side of a solid block. */
  kind: "lattice" | "edge" | "angled" | "ground";
  /** A floor edge's outward direction (towards the void it faces). */
  out?: [number, number];
};

/** Lines that may meet another mid-way, so they are the ones cut against their neighbours. */
const cutsOthers = (s: Seg): boolean => s.kind === "angled" || s.kind === "ground";

/** Whether a point lies on painted floor: inside any material shape, holes left out, and not in a solid block's
 *  square (a block is cut in squares and stands on the floor painted under it). */
function shapeTest(layers: DungeonMapLayers): (x: number, y: number) => boolean {
  const shapes = Object.values(layers.ground).map((region) => {
    const loops = groundLoops(region);
    const xs = loops.flatMap((loop) => loop.map((p) => p[0]));
    const ys = loops.flatMap((loop) => loop.map((p) => p[1]));
    return { loops, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  });
  return (x, y) =>
    !layers.solidBlock[cellKey(Math.floor(x), Math.floor(y))] &&
    shapes.some((s) => x >= s.minX && x <= s.maxX && y >= s.minY && y <= s.maxY && s.loops.filter((ring) => pointInRing(x, y, ring)).length % 2 === 1);
}

/** The segments near a point, by the squares each one's box touches. */
function nearby(segs: readonly Seg[]): (p: Pt) => readonly Seg[] {
  const buckets = new Map<string, Seg[]>();
  for (const s of segs) {
    const x1 = Math.floor(Math.max(s.a[0], s.b[0]) + 1e-3);
    const y1 = Math.floor(Math.max(s.a[1], s.b[1]) + 1e-3);
    for (let y = Math.floor(Math.min(s.a[1], s.b[1]) - 1e-3); y <= y1; y++) for (let x = Math.floor(Math.min(s.a[0], s.b[0]) - 1e-3); x <= x1; x++) {
      const list = buckets.get(`${x},${y}`);
      if (list) list.push(s);
      else buckets.set(`${x},${y}`, [s]);
    }
  }
  return (p) => buckets.get(`${Math.floor(p[0])},${Math.floor(p[1])}`) ?? [];
}

const midOf = (s: Seg): Pt => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];

/** A line lies on one of `others` when both its ends and its middle do. */
function liesOn(s: Seg, others: (p: Pt) => readonly Seg[]): boolean {
  return [s.a as Pt, s.b as Pt, midOf(s)].every((q) => others(q).some((w) => projectOnSegment(q, w.a, w.b).dist < WELD));
}

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

/** The walls alone: lattice walls and angled or curved ones (doors included), with no floor in the picture. */
function wallSegments(layers: DungeonMapLayers): Seg[] {
  const segs: Seg[] = [];
  const geometry = cachedWallGeometry(layers.walls);
  for (const key of Object.keys(layers.walls).sort()) {
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
  return segs;
}

/** Every line a room can be bounded by, before the pieces are cut where they meet. */
function collectSegments(layers: DungeonMapLayers, onShape: (x: number, y: number) => boolean): Seg[] {
  const wallKeys = Object.keys(layers.walls).sort();
  const segs = wallSegments(layers);

  // The outline of every painted floor shape. Which pieces are the floor's outside is settled once they are cut.
  for (const id of Object.keys(layers.ground).sort()) {
    for (const loop of groundLoops(layers.ground[id])) {
      loop.forEach((p, i) => {
        const q = loop[(i + 1) % loop.length];
        if (!samePt(p, q)) segs.push({ a: [p[0], p[1]], b: [q[0], q[1]], kind: "ground" });
      });
    }
  }

  // A solid block is cut in squares and stands on whatever floor is painted under it, so its sides are outline too.
  for (const k of Object.keys(layers.solidBlock).sort()) {
    const [x, y] = k.split(",").map(Number);
    segs.push(
      { a: [x, y], b: [x + 1, y], kind: "ground" },
      { a: [x + 1, y], b: [x + 1, y + 1], kind: "ground" },
      { a: [x, y + 1], b: [x + 1, y + 1], kind: "ground" },
      { a: [x, y], b: [x, y + 1], kind: "ground" },
    );
  }

  // A square of floor that no shape covers is bounded by its own edge where it faces nothing, unless a wall already
  // stands there. A square on a shape is bounded by the lines above.
  const seen = new Set<string>(wallKeys);
  const floorKeys = Object.keys(layers.floor).sort();
  for (const k of floorKeys) {
    const [x, y] = k.split(",").map(Number);
    if (!isOpenFloor(layers, x, y)) continue;
    for (const [dx, dy, side] of SIDES) {
      if (isOpenFloor(layers, x + dx, y + dy)) continue;
      if (onShape(x + 0.5, y + 0.5)) continue;
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

/** Cuts segments where they meet, so the pieces share end points. */
function weld(segs: Seg[], onShape: (x: number, y: number) => boolean): Seg[] {
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

  // Angled walls and floor outlines are the pieces that can meet others mid-way; lattice pieces only meet at corners.
  const done = new Set<string>();
  segs.forEach((s, i) => {
    if (!cutsOthers(s)) return;
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
        else if (m.kind === "overlap" && (t.kind === "edge" || t.kind === "ground")) {
          // A floor edge lying along an angled wall: cut it where the wall's ends fall, so the covered stretch can go.
          // A floor outline along a wall, or along another shape's outline, is cut the same way, so each stretch is
          // judged on its own. (The other way round needs no cut: a closed outline's next piece touches there.)
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
  const kept = out.filter((s) => s.kind !== "edge" || !(onAngled(s.a) && onAngled(s.b) && onAngled([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2])));
  return floorOutside(kept, onShape);
}

/**
 * Of the floor shapes' outlines and the solid blocks' sides, only the outside of the painted floor bounds a room. A
 * piece with floor on both sides is a shoreline between two materials, or the buried edge of a shape painted over: it
 * goes. So does a piece with floor on neither side (an outline running under a solid block, the side two blocks
 * share). A piece lying on a wall is that
 * wall's line, not a second one, for the reason a floor edge on an angled wall is; and where two shapes end on the
 * same line, one copy stays.
 */
function floorOutside(pieces: Seg[], onShape: (x: number, y: number) => boolean): Seg[] {
  const walls = nearby(pieces.filter((s) => s.kind === "lattice" || s.kind === "angled"));
  const seen = new Set<string>();
  return pieces.filter((s) => {
    if (s.kind !== "ground") return true;
    if (liesOn(s, walls)) return false;
    const [mx, my] = midOf(s);
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const nx = (-(s.b[1] - s.a[1]) / len) * STEP;
    const ny = ((s.b[0] - s.a[0]) / len) * STEP;
    if (onShape(mx + nx, my + ny) === onShape(mx - nx, my - ny)) return false;
    const [p, q] = [`${s.a[0]},${s.a[1]}`, `${s.b[0]},${s.b[1]}`].sort();
    if (seen.has(`${p}|${q}`)) return false;
    seen.add(`${p}|${q}`);
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

/** How far (cells) to step off a piece to say which side of a wall it is on. */
const STEP = 0.01;

/**
 * A plain floor edge is a boundary only when no wall beyond it closes that void together with the room: the faces of
 * the walls alone are found first, and an edge whose far side lies inside a wall face that holds its near side is
 * dropped, so a pocket of void a wall closes off (the corner a diagonal cuts off a stepped floor) is part of the room.
 * A room open on that side, with no wall beyond, keeps closing along its floor edge.
 */
function enclosedVoidsJoinRooms(pieces: Seg[]): Seg[] {
  const open = (s: Seg): boolean => s.kind === "edge" || s.kind === "ground";
  const rest = pieces.filter((s) => !open(s));
  if (rest.length === pieces.length || rest.length === 0) return pieces;
  const walls: Record<string, WallEdge> = {};
  rest.forEach((s, i) => {
    walls[`w${i}`] = { type: "wall", pack_id: "", pack_version: 0, variant: 0, a: s.a, b: s.b };
  });
  const rings = detectRooms(buildGraph(walls)).map((f) => f.polygon);
  return pieces.filter((s) => {
    if (!open(s)) return true;
    const [mx, my] = midOf(s);
    // A floor outline has no stored outward side; the test below asks the same of both sides, so its normal will do.
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const out = s.out ?? [-(s.b[1] - s.a[1]) / len, (s.b[0] - s.a[0]) / len];
    const near: Pt = [mx - out[0] * STEP, my - out[1] * STEP];
    const far: Pt = [mx + out[0] * STEP, my + out[1] * STEP];
    return !rings.some((ring) => pointInRing(near[0], near[1], ring) && pointInRing(far[0], far[1], ring));
  });
}

/**
 * The rooms of a drawing: one per face of the wall graph that holds open floor. A square belongs to the smallest face
 * around its middle, so a closet walled inside a hall is its own room and the hall keeps the rest.
 */
export function findFaces(layers: DungeonMapLayers, opts: { simplify?: boolean } = {}): FoundFace[] {
  const onShape = shapeTest(layers);
  const pieces = enclosedVoidsJoinRooms(weld(collectSegments(layers, onShape), onShape));
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
    out.push({ cells: cellsOf[i], outline: opts.simplify === false ? face.polygon : simplifyLoop(face.polygon) });
  });
  return out;
}

/**
 * The smallest closed ring of walls around a point, whether or not any floor is painted inside it. This is what lets
 * the Assign tool make a room of a picture map that has only walls drawn over it: the DM picks which rings are rooms by
 * clicking inside them, so a ring is never a room by itself (a wall round a pillar must not become one by accident).
 * Floor edges and floor-shape outlines are left out on purpose, so only walls close a face here. Its `cells` are the
 * squares whose middle lies in the ring and in no smaller ring nested inside it, minus solid blocks. Null when the
 * point is in no closed ring.
 */
export function wallFaceAt(layers: DungeonMapLayers, point: readonly [number, number]): FoundFace | null {
  const pieces = weld(wallSegments(layers), () => false);
  const walls: Record<string, WallEdge> = {};
  pieces.forEach((s, i) => {
    walls[`f${i}`] = { type: "wall", pack_id: "", pack_version: 0, variant: 0, a: s.a, b: s.b };
  });
  const faces = detectRooms(buildGraph(walls)).sort((p, q) => p.area - q.area);
  const index = faces.findIndex((f) => pointInRing(point[0], point[1], f.polygon));
  if (index < 0) return null;

  // Smaller faces claim their squares first, so a ring nested inside keeps its squares out of the one around it.
  const owner = new Set<CellKey>();
  let cells: CellKey[] = [];
  for (let i = 0; i <= index; i++) {
    const mine: CellKey[] = [];
    for (const k of floorCellsOf(faces[i].polygon)) {
      if (owner.has(k) || layers.solidBlock[k]) continue;
      owner.add(k);
      mine.push(k);
    }
    if (i === index) cells = mine;
  }
  return { cells, outline: simplifyLoop(faces[index].polygon) };
}
