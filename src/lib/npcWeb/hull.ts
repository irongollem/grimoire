/**
 * The boundary drawn around a focused faction's members.
 *
 * Membership is *containment* here rather than a line to a hub — the shape says
 * "these people are inside this thing" without adding a node that would
 * out-compete the relationships for the layout's attention.
 *
 * Only ever one faction at a time, and that is the design rather than a
 * limitation: NPCs sit in several factions at once, so drawing every faction's
 * boundary at once produces overlapping blobs that are harder to read than no
 * boundary at all. Focus one, and containment becomes unambiguous.
 *
 * That faction may still get *several* shapes. See `clusterByProximity`.
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
 * that into a disc. Chrome does paint one — checked, since `getBBox` reports 0x0
 * for it and that looks like it does not.
 *
 * The fence no longer asks for that case: it filters clusters of one out before
 * calling here, because a boundary round a single node asserts a group that is
 * not there. This stays correct for any caller that does want it rather than
 * being made to return "" and quietly swallow a point.
 */
export function hullPath(points: readonly Point[]): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  if (!rest.length) return `M ${first.x} ${first.y} L ${first.x} ${first.y}`;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;
}

/**
 * How far apart two members can be and still share a shape.
 *
 * Graph units, in a layout whose link distance is 100 — so this is "about two
 * relationships away". Members further apart than that are not in the same part
 * of the story, whatever the roster says.
 */
export const CLUSTER_DISTANCE = 240;

/**
 * Split members into groups that are actually near each other.
 *
 * One convex hull around every member of a faction is only honest when they sit
 * together. When they do not, two members on opposite sides of the map stretch
 * the shape across everything in between — it swallows dozens of non-members and
 * says nothing except "this faction exists somewhere". Measured on a real
 * campaign, a four-member faction produced a sliver spanning most of the graph.
 *
 * The alternative was to make the layout pull members together first, which
 * works and costs too much: the graph rearranges under the reader every time
 * they focus, and the spatial memory they had built up of where people are is
 * gone. Better to leave people where they are and let the faction be in two
 * places, which is usually the truth anyway.
 *
 * Single-linkage: near-enough to *any* member of a group joins that group, so a
 * chain of neighbours stays one shape rather than fragmenting at arbitrary
 * points. O(n²) over the members of one faction, which is tens at the most.
 */
export function clusterByProximity(points: readonly Point[], threshold = CLUSTER_DISTANCE): Point[][] {
  const unvisited = new Set(points.map((_, i) => i));
  const clusters: Point[][] = [];
  const withinReach = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= threshold;

  while (unvisited.size) {
    const seed: number = unvisited.values().next().value!;
    unvisited.delete(seed);

    const cluster = [points[seed]];
    const queue = [points[seed]];
    // Breadth-first through the proximity graph: everything transitively close
    // to the seed lands in one cluster.
    while (queue.length) {
      const current = queue.pop()!;
      // Iterating the live set is safe here: the only element removed is the
      // one currently in hand, which Set iteration is defined to tolerate.
      for (const i of unvisited) {
        if (!withinReach(current, points[i])) continue;
        unvisited.delete(i);
        cluster.push(points[i]);
        queue.push(points[i]);
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}
