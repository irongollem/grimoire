// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRESSURE_CURVE, FIRM } from "./engine/pressure";
import { loadPressureCurve, PRESSURE_CURVE_KEY, savePressureCurve } from "./pressureStore";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the device's pressure curve", () => {
  // Fails if the curve is not kept: a DM would retune the pen on every picture.
  it("comes back after being saved", () => {
    savePressureCurve(FIRM);
    expect(loadPressureCurve()).toEqual(FIRM);
  });

  // Fails if a browser that blocks site data (reading `localStorage` throws) stops the curve from loading or saving.
  it("blocked site data gives the default, and a saved curve still reads back this session", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadPressureCurve()).toEqual(DEFAULT_PRESSURE_CURVE);
    expect(() => savePressureCurve(FIRM)).not.toThrow();
    expect(loadPressureCurve()).toEqual(FIRM);
  });

  // Fails if a stale or hand-edited value is trusted: a curve of NaNs would make every stroke zero pressure.
  it("ignores a stored value that is not a curve", () => {
    localStorage.setItem(PRESSURE_CURVE_KEY, JSON.stringify({ c1: { x: "a", y: 0 }, c2: { x: 2, y: 0.5 } }));
    expect(loadPressureCurve()).toEqual(DEFAULT_PRESSURE_CURVE);
    localStorage.setItem(PRESSURE_CURVE_KEY, "{nope");
    expect(loadPressureCurve()).toEqual(DEFAULT_PRESSURE_CURVE);
  });
});
