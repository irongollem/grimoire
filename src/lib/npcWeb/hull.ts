/**
 * The boundary drawn around a focused faction's members.
 *
 * Membership is *containment* here rather than a line to a hub — the shape says
 * "these people are inside this thing" without adding a node that would
 * out-compete the relationships for the layout's attention.
 *
 * Only ever one hull at a time, and that is the design rather than a limitation:
 * NPCs sit in several factions at once, so drawing every faction's boundary at
 * once produces overlapping blobs that are harder to read than no boundary at
 * all. Focus one, and containment becomes unambiguous.
 */

export interface Point {
  x: number;
  y: number;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Andrew's monotone chain, counter-clockwise.
 *
 * Degenerate inputs are returned as-is rather than rejected: one member is a
 * legitimate faction and two is common, and both still have to draw. The
 * rendering handles them — see `hullPath`.
 */
export function convexHull(points: readonly Point[]): Point[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const half = (input: Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };

  const hull = [...half(sorted), ...half([...sorted].reverse())];
  // Every point collinear: the halves collapse and the hull degenerates to the
  // two extremes, which still draws correctly as a capsule.
  return hull.length ? hull : [sorted[0], sorted[sorted.length - 1]];
}

/**
 * Push each vertex away from the hull's centre.
 *
 * Straight-line offset rather than a true Minkowski sum: the shape is drawn with
 * a thick round-joined stroke, which rounds the corners and hides the difference,
 * and the exact offset of a corner is not information anyone reads off this.
 */
export function padOutward(hull: readonly Point[], padding: number): Point[] {
  if (!hull.length) return [];
  const cx = hull.reduce((sum, p) => sum + p.x, 0) / hull.length;
  const cy = hull.reduce((sum, p) => sum + p.y, 0) / hull.length;

  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy);
    // A single member has no direction to grow in; the stroke gives it its size.
    if (len < 1e-6) return { x: p.x, y: p.y };
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
}

/**
 * An SVG path for the hull.
 *
 * A lone point still emits a zero-length line, because a round line cap turns
 * that into a disc — which is what a one-member faction should look like. Drop it
 * and the single most common small-faction case renders nothing at all.
 */
export function hullPath(points: readonly Point[]): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  if (!rest.length) return `M ${first.x} ${first.y} L ${first.x} ${first.y}`;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;
}
