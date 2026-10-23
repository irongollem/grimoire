/**
 * The geometry of a page curl (#1085). A leaf is a w by h rectangle hinged at its left edge (the spine). A fold line
 * sweeps across it from the right edge to the left; the part of the paper beyond the fold is folded back over and
 * lands mirrored on the other side of the line. This module turns a progress value into the shapes the renderer
 * needs: what is left of the leaf's face, where the folded part lies, the matrix that carries the back of the page
 * there, and how dark the crease and the cast shadow should be. It touches no DOM.
 *
 * Coordinates are the leaf's own: x runs from the spine (0) to the outer edge (w), y from the top to the bottom.
 */

export interface Pt {
  x: number;
  y: number;
}

/** CSS matrix(a, b, c, d, e, f). */
export type Matrix = [number, number, number, number, number, number];

export interface CurlFrame {
  /** A point on the fold line, at mid height. */
  origin: Pt;
  /** Unit normal of the fold line, pointing at the folded side. */
  normal: Pt;
  /** Rotation of the normal from the x axis, in radians. */
  angle: number;
  /** The part of the face still lying flat. */
  front: Pt[];
  /** The part of the face beyond the fold, where it lay before folding (the page it uncovers). */
  folded: Pt[];
  /** The folded part where it lands, cut to the visible area. */
  back: Pt[];
  /** Carries an element laid out as the back page (w by h, origin top left) onto its folded position. */
  backMatrix: Matrix;
  /** 0 to 1: how deep the cast shadow and the crease shading are. */
  depth: number;
}

export interface CurlOptions {
  /** How far left of the spine the folded paper may show, as a fraction of w. A spread allows 1, a lone page 0. */
  reach: number;
}

/** Tilt of the fold line at its steepest, as the tangent of its angle from the vertical. */
const MAX_TILT = 0.34;

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Slow out of the corner, quick across the middle, soft landing. */
export function easeTurn(u: number): number {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Keep the part of a convex polygon where `sign * ((p - at) . n) >= 0` (Sutherland-Hodgman, one edge). */
export function clipHalfPlane(poly: Pt[], at: Pt, n: Pt, sign: 1 | -1): Pt[] {
  const out: Pt[] = [];
  const dist = (p: Pt) => sign * ((p.x - at.x) * n.x + (p.y - at.y) * n.y);
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const da = dist(a);
    const db = dist(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const k = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  }
  return out;
}

function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** The frame at `progress`: 0 is the leaf lying flat on the right, 1 is it folded wholly over to the left. */
export function curlFrame(progress: number, w: number, h: number, options: CurlOptions): CurlFrame {
  const p = clamp01(progress);
  // Steep as the corner lifts, upright as the leaf lands.
  const t = MAX_TILT * (1 - p) ** 1.3;
  const len = Math.hypot(1, t);
  const normal: Pt = { x: 1 / len, y: t / len };
  // The fold crosses the bottom edge at w(1 - p), so it starts on the outer bottom corner and the top edge follows.
  const origin: Pt = { x: w * (1 - p) + (h / 2) * t, y: h / 2 };
  const face = rect(0, 0, w, h);
  const front = clipHalfPlane(face, origin, normal, -1);
  const folded = clipHalfPlane(face, origin, normal, 1);

  // Reflection across the fold line: x' = A x + 2 (P . n) n, with A = I - 2 n n^T.
  const a00 = 1 - 2 * normal.x * normal.x;
  const a01 = -2 * normal.x * normal.y;
  const a11 = 1 - 2 * normal.y * normal.y;
  const k = 2 * (origin.x * normal.x + origin.y * normal.y);
  const reflect = (q: Pt): Pt => ({ x: a00 * q.x + a01 * q.y + k * normal.x, y: a01 * q.x + a11 * q.y + k * normal.y });

  let back = folded.map(reflect);
  const left = -w * options.reach;
  back = clipHalfPlane(back, { x: left, y: 0 }, { x: 1, y: 0 }, 1);
  back = clipHalfPlane(back, { x: 0, y: 0 }, { x: 0, y: 1 }, 1);
  back = clipHalfPlane(back, { x: 0, y: h }, { x: 0, y: -1 }, 1);

  // The back page is the next verso: its pixel u sits at paper point (w - u.x, u.y), which the fold then reflects.
  const backMatrix: Matrix = [
    -a00,
    -a01,
    a01,
    a11,
    a00 * w + k * normal.x,
    a01 * w + k * normal.y,
  ];

  return { origin, normal, angle: Math.atan2(normal.y, normal.x), front, folded, back, backMatrix, depth: Math.sin(Math.PI * p) ** 0.7 };
}

/** A CSS clip-path for a polygon in the element's own pixels; nothing at all when it has no area. */
export function polygonCss(pts: Pt[]): string {
  if (pts.length < 3) return "polygon(0 0, 0 0, 0 0)";
  return `polygon(${pts.map((q) => `${q.x.toFixed(2)}px ${q.y.toFixed(2)}px`).join(", ")})`;
}

export function matrixCss(m: Matrix): string {
  return `matrix(${m.map((v) => v.toFixed(5)).join(", ")})`;
}
