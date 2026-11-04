// The wall model of the live battle map (epic #1125 decision 5): a wall is a segment between two points in cell units,
// whatever drew it. A wall on a grid line is a segment whose id is its edge key (`"x,y:N"`, `"x,y:W"`); an angled wall
// has an id of its own. Sight and light test segments, so nothing downstream cares which kind it is. Pure and DOM-free.

/** A point in cell units (image cells at runtime). */
export type Point = readonly [number, number];

export interface WallSegment {
  /** Stable name: the edge key for a wall on a grid line. Doors and door states refer to a segment by it. */
  id: string;
  a: Point;
  b: Point;
}

/** The edge key of the NW-owned lattice edge: `"x,y:N"` is the top of cell (x,y), `"x,y:W"` its left. */
export function latticeKey(x: number, y: number, side: "N" | "W"): string {
  return `${x},${y}:${side}`;
}

/** The segment a lattice edge key names: N runs (x,y)->(x+1,y), W runs (x,y)->(x,y+1). Its id is the key. */
export function latticeSegment(edgeKey: string): WallSegment {
  const [cell, side] = edgeKey.split(":");
  const [xs, ys] = cell.split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (side === "N") return { id: edgeKey, a: [x, y], b: [x + 1, y] };
  if (side === "W") return { id: edgeKey, a: [x, y], b: [x, y + 1] };
  throw new Error(`Not a lattice edge key: ${edgeKey}`);
}

/** Which way a segment lies on the grid: "H" along a row line, "V" along a column line, null when it is angled. */
export function segmentAxis(a: Point, b: Point): "H" | "V" | null {
  if (a[1] === b[1] && a[0] !== b[0]) return "H";
  if (a[0] === b[0] && a[1] !== b[1]) return "V";
  return null;
}

/** How close counts as touching, in the units of the cross product (cells squared). */
const EPS = 1e-9;

const cross = (o: Point, p: Point, q: Point): number => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
const sign = (v: number): number => (v > EPS ? 1 : v < -EPS ? -1 : 0);
const within = (v: number, lo: number, hi: number): boolean => v >= Math.min(lo, hi) - EPS && v <= Math.max(lo, hi) + EPS;

/** Whether p, known to lie on the line through a and b, lies between them. */
const onSpan = (a: Point, b: Point, p: Point): boolean => within(p[0], a[0], b[0]) && within(p[1], a[1], b[1]);

/**
 * Whether segment a-b meets segment c-d. Closed: touching at an end point counts, and so does collinear overlap, so a
 * ray that grazes the end of a wall or runs along one is stopped by it.
 */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = sign(cross(a, b, c));
  const o2 = sign(cross(a, b, d));
  const o3 = sign(cross(c, d, a));
  const o4 = sign(cross(c, d, b));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSpan(a, b, c)) return true;
  if (o2 === 0 && onSpan(a, b, d)) return true;
  if (o3 === 0 && onSpan(c, d, a)) return true;
  if (o4 === 0 && onSpan(c, d, b)) return true;
  return false;
}

const OFFSET = 1 << 15;
const SPAN = 1 << 16;
/** A cell as one number; coordinates stay well inside +-32768 cells. */
export const cellNum = (x: number, y: number): number => (x + OFFSET) * SPAN + (y + OFFSET);

export interface SegmentIndex {
  /** Segments by every cell their line passes through (a segment on a grid line is in the cells on both sides). */
  cells: ReadonlyMap<number, readonly WallSegment[]>;
  empty: boolean;
}

/** Slack on the cell range, so a segment ending exactly on a grid line is also filed in the cell beyond it. */
const FILE_EPS = 1e-9;

/** File each segment under every cell it touches, so a line walk tests only the segments of the cells it crosses. */
export function buildSegmentIndex(segments: readonly WallSegment[]): SegmentIndex {
  const cells = new Map<number, WallSegment[]>();
  const file = (cx: number, cy: number, seg: WallSegment) => {
    const key = cellNum(cx, cy);
    const list = cells.get(key);
    if (list) list.push(seg);
    else cells.set(key, [seg]);
  };
  for (const seg of segments) {
    const [ax, ay] = seg.a;
    const [bx, by] = seg.b;
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const slope = bx === ax ? 0 : (by - ay) / (bx - ax);
    for (let cx = Math.floor(minX - FILE_EPS); cx <= Math.floor(maxX + FILE_EPS); cx++) {
      // The part of the segment inside this column, and the rows that part spans.
      const x0 = Math.max(minX, cx);
      const x1 = Math.min(maxX, cx + 1);
      const yAt = (x: number) => (bx === ax ? undefined : ay + (x - ax) * slope);
      const y0 = yAt(x0) ?? Math.min(ay, by);
      const y1 = yAt(x1) ?? Math.max(ay, by);
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);
      for (let cy = Math.floor(lo - FILE_EPS); cy <= Math.floor(hi + FILE_EPS); cy++) file(cx, cy, seg);
    }
  }
  return { cells, empty: segments.length === 0 };
}
