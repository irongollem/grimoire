import { describe, expect, it } from "vitest";
import { DEFAULT_PRESSURE_CURVE, FIRM, SOFT, applyPressureCurve } from "./pressure";

describe("applyPressureCurve", () => {
  for (const [name, curve] of [["default", DEFAULT_PRESSURE_CURVE], ["soft", SOFT], ["firm", FIRM]] as const) {
    // Fails if the ends are not pinned: a feather touch would paint, or full press would not reach full.
    it(`${name} maps 0 to 0 and 1 to 1`, () => {
      expect(applyPressureCurve(curve, 0)).toBe(0);
      expect(applyPressureCurve(curve, 1)).toBe(1);
    });
    // Fails if the x solve picks the wrong root, making harder presses paint lighter.
    it(`${name} never falls as pressure rises`, () => {
      let last = -1;
      for (let i = 0; i <= 100; i++) {
        const y = applyPressureCurve(curve, i / 100);
        expect(y).toBeGreaterThanOrEqual(last - 1e-9);
        last = y;
      }
    });
  }

  // Fails if soft and firm are swapped or ignored: the presets must differ in the direction their names say.
  it("soft lifts mid pressure and firm lowers it", () => {
    expect(applyPressureCurve(SOFT, 0.5)).toBeGreaterThan(0.5);
    expect(applyPressureCurve(FIRM, 0.5)).toBeLessThan(0.5);
  });

  // Fails if out-of-range input from a driver leaks through instead of clamping.
  it("clamps input outside 0 to 1", () => {
    expect(applyPressureCurve(DEFAULT_PRESSURE_CURVE, -3)).toBe(0);
    expect(applyPressureCurve(DEFAULT_PRESSURE_CURVE, 7)).toBe(1);
  });
});
