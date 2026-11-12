import { describe, expect, it } from "vitest";
import { DEFAULT_PRESSURE_CURVE } from "../engine/pressure";
import { clampPoint, matchPreset, nudge, pointFromPointer, CURVE_PRESETS } from "./curveEditor";

describe("curve points", () => {
  it("clamps into the unit square, and NaN to zero", () => {
    expect(clampPoint({ x: -1, y: 2 })).toEqual({ x: 0, y: 1 });
    expect(clampPoint({ x: NaN, y: 0.5 })).toEqual({ x: 0, y: 0.5 });
  });
  it("keeps a nudge inside the square", () => {
    expect(nudge(DEFAULT_PRESSURE_CURVE, "c2", 5, 5).c2).toEqual({ x: 1, y: 1 });
    expect(nudge(DEFAULT_PRESSURE_CURVE, "c1", -5, -5).c1).toEqual({ x: 0, y: 0 });
  });
  it("turns a pointer position into a point with y up, clamped when dragged outside", () => {
    const rect = { left: 10, top: 10, width: 100, height: 100 };
    expect(pointFromPointer(60, 10, rect)).toEqual({ x: 0.5, y: 1 });
    expect(pointFromPointer(-500, 900, rect)).toEqual({ x: 0, y: 0 });
  });
});

describe("matchPreset", () => {
  it("finds each preset and returns null for a hand-set curve", () => {
    for (const k of ["soft", "normal", "firm"] as const) expect(matchPreset(CURVE_PRESETS[k])).toBe(k);
    expect(matchPreset({ c1: { x: 0.3, y: 0.3 }, c2: { x: 0.7, y: 0.7 } })).toBeNull();
  });
});
