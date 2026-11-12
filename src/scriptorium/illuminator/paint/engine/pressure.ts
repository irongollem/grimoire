import type { PressureCurve } from "./types";

/** A gentle default: close to straight, a touch softer at the light end. */
export const DEFAULT_PRESSURE_CURVE: PressureCurve = { c1: { x: 0.25, y: 0.2 }, c2: { x: 0.75, y: 0.8 } };
/** Light touches already count for more. */
export const SOFT: PressureCurve = { c1: { x: 0.2, y: 0.45 }, c2: { x: 0.6, y: 0.9 } };
/** It takes a firm press to reach full. */
export const FIRM: PressureCurve = { c1: { x: 0.4, y: 0.1 }, c2: { x: 0.8, y: 0.55 } };

function cubic(p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

/** Maps a raw pen pressure (0 to 1) through the curve to the pressure the brush sees (0 to 1). */
export function applyPressureCurve(curve: PressureCurve, pressure: number): number {
  const x = Math.min(1, Math.max(0, pressure));
  if (x === 0) return 0;
  if (x === 1) return 1;
  // Solve cubic(c1.x, c2.x, t) = x by bisection; x(t) rises for control points in 0..1.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(curve.c1.x, curve.c2.x, mid) < x) lo = mid;
    else hi = mid;
  }
  const y = cubic(curve.c1.y, curve.c2.y, (lo + hi) / 2);
  return Math.min(1, Math.max(0, y));
}
