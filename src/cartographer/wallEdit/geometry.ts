// Small planar helpers for the wall node graph (epic #1125, canvas frame 17). Cell units throughout.

export type Pt = readonly [number, number];

/** Two points closer than this are one node (cells). */
export const WELD = 1e-6;

/** Round away float dust: near an integer snaps to it, otherwise 1e-6 precision (app convention). */
export function clean(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < WELD ? r : Math.round(v * 1e6) / 1e6;
}

export const cleanPt = (p: Pt): [number, number] => [clean(p[0]), clean(p[1])];

export const samePt = (p: Pt, q: Pt): boolean => Math.abs(p[0] - q[0]) < WELD && Math.abs(p[1] - q[1]) < WELD;

export const dist = (p: Pt, q: Pt): number => Math.hypot(q[0] - p[0], q[1] - p[1]);

/** Stable node id: the cleaned position. Two walls ending at one point share a node by construction. */
export function nodeIdOf(p: Pt): string {
  return `${clean(p[0])},${clean(p[1])}`;
}

/** Where `p` falls on segment a-b: parameter t (clamped to 0..1), the foot point and the distance to it. */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): { t: number; foot: [number, number]; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const foot: [number, number] = [a[0] + dx * t, a[1] + dy * t];
  return { t, foot, dist: dist(p, foot) };
}

export const lerp = (a: Pt, b: Pt, t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const cross = (o: Pt, p: Pt, q: Pt): number => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);

/**
 * How segments a-b and c-d meet. `cross` is a single point interior to both; `touch-ab` / `touch-cd` is an end of the
 * other segment lying inside this one (a T); `overlap` is collinear sharing length; `none` otherwise (a shared end
 * point is `none`: it is already a node).
 */
export type Meeting =
  | { kind: "none" }
  | { kind: "overlap" }
  | { kind: "cross"; point: [number, number] }
  | { kind: "touch-ab"; point: [number, number] }
  | { kind: "touch-cd"; point: [number, number] };

export function meet(a: Pt, b: Pt, c: Pt, d: Pt): Meeting {
  const abLen = dist(a, b);
  const cdLen = dist(c, d);
  const onAb = (p: Pt): boolean => projectOnSegment(p, a, b).dist < WELD;
  const onCd = (p: Pt): boolean => projectOnSegment(p, c, d).dist < WELD;
  const interiorAb = (p: Pt): boolean => onAb(p) && !samePt(p, a) && !samePt(p, b);
  const interiorCd = (p: Pt): boolean => onCd(p) && !samePt(p, c) && !samePt(p, d);

  const denom = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denom) < WELD * abLen * cdLen) {
    // Parallel. Collinear only when c lies on the line a-b.
    if (Math.abs(cross(a, b, c)) > WELD * abLen || Math.abs(cross(a, b, d)) > WELD * abLen) return { kind: "none" };
    const ux = (b[0] - a[0]) / abLen;
    const uy = (b[1] - a[1]) / abLen;
    const s = (p: Pt): number => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
    const lo = Math.max(0, Math.min(s(c), s(d)));
    const hi = Math.min(abLen, Math.max(s(c), s(d)));
    return hi - lo > WELD ? { kind: "overlap" } : { kind: "none" };
  }
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denom;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denom;
  const point = cleanPt(lerp(a, b, t));
  if (t < -WELD / abLen || t > 1 + WELD / abLen || u < -WELD / cdLen || u > 1 + WELD / cdLen) return { kind: "none" };
  const inAb = interiorAb(point);
  const inCd = interiorCd(point);
  if (inAb && inCd) return { kind: "cross", point };
  if (inAb) return { kind: "touch-ab", point };
  if (inCd) return { kind: "touch-cd", point };
  return { kind: "none" };
}

export function polygonArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return s / 2;
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
