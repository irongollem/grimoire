/*
 * The pen's pressure curve is a property of the device, not of a picture or a brush, so it is kept in the
 * browser (#1181) through `safeLocalStorage`, which falls back to memory where site data is blocked, so painting
 * works without storage and the curve is simply forgotten on reload.
 */
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { DEFAULT_PRESSURE_CURVE } from "./engine/pressure";
import type { PressureCurve } from "./engine/types";

export const PRESSURE_CURVE_KEY = "grimoire.paint.pressureCurve";

function isUnit(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
}

function isCurve(value: unknown): value is PressureCurve {
  if (typeof value !== "object" || value === null) return false;
  const { c1, c2 } = value as Record<string, unknown>;
  const point = (p: unknown) => typeof p === "object" && p !== null && isUnit((p as Record<string, unknown>).x) && isUnit((p as Record<string, unknown>).y);
  return point(c1) && point(c2);
}

export function loadPressureCurve(): PressureCurve {
  const raw = safeLocalStorage().getItem(PRESSURE_CURVE_KEY);
  if (raw === null) return DEFAULT_PRESSURE_CURVE;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCurve(parsed) ? parsed : DEFAULT_PRESSURE_CURVE;
  } catch {
    // A stored value that is not JSON is not a curve.
    return DEFAULT_PRESSURE_CURVE;
  }
}

export function savePressureCurve(curve: PressureCurve): void {
  try {
    safeLocalStorage().setItem(PRESSURE_CURVE_KEY, JSON.stringify(curve));
  } catch {
    // The helper guards reading the storage; a full quota can still refuse the write. A per-device convenience: not worth interrupting a stroke for.
  }
}
