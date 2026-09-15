import { describe, it, expect } from "vitest";
import { valueNoise2D, caveBrushCells } from "./caveBrush";

describe("valueNoise2D", () => {
  it("returns values in [0, 1]", () => {
    for (let i = 0; i < 20; i++) {
      const v = valueNoise2D(i * 0.37, i * 0.61, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same input", () => {
    const a = valueNoise2D(1.5, 2.7, 99);
    const b = valueNoise2D(1.5, 2.7, 99);
    expect(a).toBe(b);
  });

  it("changes with seed", () => {
    const a = valueNoise2D(1.5, 2.7, 1);
    const b = valueNoise2D(1.5, 2.7, 2);
    expect(a).not.toBe(b);
  });
});

describe("caveBrushCells", () => {
  it("includes the centre cell reliably", () => {
    // Centre has maximum edgeFade, so the threshold is lowest (0.08) and
    // the noise reliably exceeds it.
    const cells = new Set(caveBrushCells(0, 0, 5, 1));
    expect(cells.has("0,0")).toBe(true);
  });

  it("never returns cells outside the radius", () => {
    const cells = caveBrushCells(0, 0, 4, 7);
    for (const key of cells) {
      const [xs, ys] = key.split(",");
      const dx = Number(xs), dy = Number(ys);
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(16);
    }
  });

  it("produces different shapes for different seeds", () => {
    const a = new Set(caveBrushCells(0, 0, 5, 1));
    const b = new Set(caveBrushCells(0, 0, 5, 999));
    // At least one cell differs between the two seeds.
    let differs = false;
    for (const k of a) if (!b.has(k)) { differs = true; break; }
    if (!differs) for (const k of b) if (!a.has(k)) { differs = true; break; }
    expect(differs).toBe(true);
  });
});
