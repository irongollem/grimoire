import type { Point } from "./scene.ts";

export interface PathSample {
  x: number;
  y: number;
  /** The direction of travel in radians, 0 when heading right (screen y grows downward, so positive turns clockwise). */
  angle: number;
}

/** Table steps per stretch between two of the maker's points; enough that the speed does not visibly lurch. */
const STEPS = 48;

/** A uniform Catmull-Rom point between `p1` and `p2` at `f` (0..1): the curve passes through every point given. */
function catmull(p0: Point, p1: Point, p2: Point, p3: Point, f: number): Point {
  const f2 = f * f;
  const f3 = f2 * f;
  const at = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
  return { x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) };
}

/** The curve through `points` as a dense polyline: closed joins the last point back to the first. */
function polyline(points: Point[], closed: boolean): Point[] {
  const n = points.length;
  const pick = (i: number) => (closed ? points[((i % n) + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
  const stretches = closed ? n : n - 1;
  const line: Point[] = [];
  for (let i = 0; i < stretches; i++) {
    for (let s = 0; s < STEPS; s++) line.push(catmull(pick(i - 1), pick(i), pick(i + 1), pick(i + 2), s / STEPS));
  }
  // An open curve ends on its last point; a closed one ends back on its first.
  line.push(closed ? { ...points[0] } : { ...points[n - 1] });
  return line;
}

/**
 * A position along a smooth curve through `points`, at constant speed: `u` (0..1) is one whole cycle.
 * Closed goes round once, back to the first point; open goes to the last point and back along the same
 * curve (there and back), so both end exactly where they began and a loop closes without a jump.
 * The curve is cut into a fine table by arc length, so equal steps of `u` cover equal distance.
 */
export function pathSampler(points: Point[], closed: boolean): (u: number) => PathSample {
  if (points.length < 2) throw new Error("A path needs at least two points.");
  const line = polyline(points, closed);
  const cumulative = [0];
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];

  /** The point `d` along the curve, going forward (`back` false) or reversed. */
  const along = (d: number, back: boolean): PathSample => {
    let lo = 0;
    let hi = cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = cumulative[hi] - cumulative[lo];
    const f = span <= 0 ? 0 : (d - cumulative[lo]) / span;
    const dx = line[hi].x - line[lo].x;
    const dy = line[hi].y - line[lo].y;
    const heading = span <= 0 ? 0 : Math.atan2(dy, dx);
    return { x: line[lo].x + dx * f, y: line[lo].y + dy * f, angle: back ? heading + Math.PI : heading };
  };

  return (u) => {
    const f = u - Math.floor(u);
    if (closed) return along(f * total, false);
    return f < 0.5 ? along(f * 2 * total, false) : along((2 - f * 2) * total, true);
  };
}
