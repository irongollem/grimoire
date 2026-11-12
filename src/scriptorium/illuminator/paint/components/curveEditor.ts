/*
 * The pressure curve editor's maths (#1181): the two control points stay in the unit square (the engine's
 * bisection assumes it), keyboard nudges, and which preset the current curve is.
 */
import type { PressureCurve } from "../engine/types";
import { DEFAULT_PRESSURE_CURVE, FIRM, SOFT } from "../engine/pressure";

export type CurvePoint = { x: number; y: number };
export type CurvePreset = "soft" | "normal" | "firm";

export const CURVE_PRESETS: Record<CurvePreset, PressureCurve> = { soft: SOFT, normal: DEFAULT_PRESSURE_CURVE, firm: FIRM };

const unit = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function clampPoint(p: CurvePoint): CurvePoint {
  return { x: unit(p.x), y: unit(p.y) };
}

/** The preset the curve equals, or null for a hand-set curve (no segment lit). */
export function matchPreset(curve: PressureCurve): CurvePreset | null {
  const eq = (a: CurvePoint, b: CurvePoint) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  for (const key of Object.keys(CURVE_PRESETS) as CurvePreset[]) {
    const p = CURVE_PRESETS[key];
    if (eq(p.c1, curve.c1) && eq(p.c2, curve.c2)) return key;
  }
  return null;
}

/** Moves one control point by `dx`,`dy` (fractions), kept inside the square. */
export function nudge(curve: PressureCurve, which: "c1" | "c2", dx: number, dy: number): PressureCurve {
  const p = curve[which];
  return { ...curve, [which]: clampPoint({ x: p.x + dx, y: p.y + dy }) };
}

/** A pointer position within the square (y up) to a curve point. */
export function pointFromPointer(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): CurvePoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return clampPoint({ x: (clientX - rect.left) / rect.width, y: 1 - (clientY - rect.top) / rect.height });
}
