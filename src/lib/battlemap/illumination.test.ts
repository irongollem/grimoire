import { describe, expect, it } from "vitest";
import { AMBIENT, illuminationGrid, lightLevelAt, type LitSource } from "./illumination";
import { DM_VEIL, veilAlpha } from "./darkness";

const torch: LitSource = { x: 10, y: 10, bright: 20, dim: 20 }; // 4 cells bright, 8 cells reach

describe("lightLevelAt", () => {
  it("clears the veil within the bright radius", () => {
    expect(lightLevelAt(AMBIENT.dark, [torch], 10, 10)).toBe(1);
    expect(lightLevelAt(AMBIENT.dark, [torch], 13, 10)).toBe(1);
  });

  it("halves it in the dim ring and leaves darkness beyond", () => {
    expect(lightLevelAt(AMBIENT.dark, [torch], 16, 10)).toBeCloseTo(0.5, 5);
    expect(lightLevelAt(AMBIENT.dark, [torch], 19, 10)).toBe(0);
  });

  it("gives a dim-only source dim light out to its reach", () => {
    const fungus: LitSource = { x: 0, y: 0, bright: 0, dim: 10 };
    expect(lightLevelAt(AMBIENT.dark, [fungus], 0, 0)).toBeCloseTo(0.5, 5);
    expect(lightLevelAt(AMBIENT.dark, [fungus], 1.5, 0)).toBeCloseTo(0.5, 5);
    expect(lightLevelAt(AMBIENT.dark, [fungus], 3, 0)).toBe(0);
  });

  it("does not add overlapping dim rings up into bright light", () => {
    const a: LitSource = { x: 0, y: 0, bright: 0, dim: 20 };
    const b: LitSource = { x: 2, y: 0, bright: 0, dim: 20 };
    expect(lightLevelAt(AMBIENT.dark, [a, b], 1, 0)).toBeCloseTo(0.5, 5);
  });

  it("is never darker than the ambient level", () => {
    expect(lightLevelAt(AMBIENT.dim, [torch], 40, 40)).toBe(0.5);
    expect(lightLevelAt(AMBIENT.dim, [torch], 10, 10)).toBe(1);
  });

  it("is bright everywhere in daylight", () => {
    expect(lightLevelAt(AMBIENT.daylight, [], 123, -4)).toBe(1);
    expect(lightLevelAt(AMBIENT.daylight, [torch], 40, 40)).toBe(1);
  });

  it("softens each edge monotonically", () => {
    let prev = 1;
    for (let d = 0; d <= 9; d += 0.05) {
      const level = lightLevelAt(0, [torch], 10 + d, 10);
      expect(level).toBeLessThanOrEqual(prev + 1e-9);
      prev = level;
    }
    const mid = lightLevelAt(0, [torch], 10 + 4 - 0.1, 10);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });
});

describe("illuminationGrid", () => {
  it("matches lightLevelAt at every sample", () => {
    const opts = { ambient: 0, sources: [torch], minX: 4, minY: 4, cols: 12, rows: 12, samplesPerCell: 2 };
    const grid = illuminationGrid(opts);
    expect(grid).toHaveLength(24 * 24);
    for (const [i, j] of [[0, 0], [12, 12], [13, 5], [23, 23], [8, 20]]) {
      expect(grid[j * 24 + i]).toBeCloseTo(lightLevelAt(0, [torch], 4 + (i + 0.5) / 2, 4 + (j + 0.5) / 2), 6);
    }
  });

  it("starts every sample at the ambient level", () => {
    const grid = illuminationGrid({ ambient: 0.5, sources: [], minX: 0, minY: 0, cols: 2, rows: 2, samplesPerCell: 4 });
    expect(grid.every((v) => v === 0.5)).toBe(true);
  });

  it("stays fast for 60x60 cells, 30 lights, 4 samples per cell", () => {
    const sources: LitSource[] = Array.from({ length: 30 }, (_, i) => ({
      x: (i * 7) % 60,
      y: (i * 13) % 60,
      bright: 20,
      dim: 20,
    }));
    const t0 = performance.now();
    illuminationGrid({ ambient: 0, sources, minX: 0, minY: 0, cols: 60, rows: 60, samplesPerCell: 4 });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
  });
});

describe("veilAlpha", () => {
  it("ties the carve to the DM's veil", () => {
    expect(veilAlpha(AMBIENT.dark)).toBeCloseTo(DM_VEIL.dark, 9);
    expect(veilAlpha(AMBIENT.dim)).toBeCloseTo(DM_VEIL.dim, 9);
    expect(veilAlpha(AMBIENT.daylight)).toBe(DM_VEIL.daylight);
  });
});
