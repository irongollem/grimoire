import { describe, it, expect } from "vitest";
import {
  SCALE_FACTORS,
  FIGURE_HEIGHT_CLAMP_MM,
  figureScaleFor,
  composeStl,
} from "./mesh-compose";
import { generateCylinderStl, parseBinaryStl, stlBounds, writeBinaryStl, type StlBounds } from "./stl";

// A 2m(x) × 1m(y) × 2m(z) box (two triangles — bounds math doesn't require a
// closed manifold), simulating a human-scale Meshy figure 1m "tall" for easy
// arithmetic, offset off-origin on x/z to exercise centering.
const FIGURE_TRIS = new Float32Array([
  0, 0, 0, 2, 0, 0, 2, 1, 2,
  0, 0, 0, 2, 1, 2, 0, 1, 2,
]);
const FIGURE_TRI_COUNT = FIGURE_TRIS.length / 9;

function boundsOf(height: number): StlBounds {
  return { min: [0, 0, 0], max: [1, height, 1] };
}

describe("SCALE_FACTORS", () => {
  it("28mm scale: 16 mm/meter (1.75m human → 28mm)", () => {
    expect(SCALE_FACTORS[28]).toBe(16);
  });
  it("32mm scale: 18.3 mm/meter (1.75m human → ~32mm)", () => {
    expect(SCALE_FACTORS[32]).toBe(18.3);
  });
});

describe("FIGURE_HEIGHT_CLAMP_MM", () => {
  it("is 12mm..60mm", () => {
    expect(FIGURE_HEIGHT_CLAMP_MM).toEqual({ min: 12, max: 60 });
  });
});

describe("figureScaleFor", () => {
  it("a 1.75m figure at 28mm scale lands exactly at 28mm (no clamping)", () => {
    const scale = figureScaleFor(boundsOf(1.75), 28);
    expect(1.75 * scale).toBeCloseTo(28);
  });

  it("a 1.75m figure at 32mm scale lands at 32.025mm (no clamping — SCALE_FACTORS[32] is pinned, not the exact repeating decimal)", () => {
    const scale = figureScaleFor(boundsOf(1.75), 32);
    expect(1.75 * scale).toBeCloseTo(32.025, 3);
  });

  it("clamps a tiny figure (pixie-scale) up to the 12mm floor", () => {
    // 0.05m * 16 = 0.8mm, well under the 12mm floor.
    const scale = figureScaleFor(boundsOf(0.05), 28);
    expect(0.05 * scale).toBeCloseTo(FIGURE_HEIGHT_CLAMP_MM.min);
  });

  it("clamps a huge figure (dragon-scale) down to the 60mm ceiling", () => {
    // 10m * 16 = 160mm, well over the 60mm ceiling.
    const scale = figureScaleFor(boundsOf(10), 28);
    expect(10 * scale).toBeCloseTo(FIGURE_HEIGHT_CLAMP_MM.max);
  });

  it("a figure that lands exactly on the clamp boundary is unaffected", () => {
    // 12mm / 16 = 0.75m projects to exactly the floor.
    const scale = figureScaleFor(boundsOf(12 / 16), 28);
    expect((12 / 16) * scale).toBeCloseTo(12);
  });

  it("throws on non-positive height bounds", () => {
    expect(() => figureScaleFor(boundsOf(0), 28)).toThrow();
    expect(() => figureScaleFor({ min: [0, 5, 0], max: [1, 2, 1] }, 28)).toThrow();
  });
});

describe("composeStl", () => {
  it("triangle count = figure triangles + base triangles", () => {
    const figureStl = writeBinaryStl([FIGURE_TRIS]);
    const baseStl = generateCylinderStl(12.5, 3.5, 32);
    const baseTriCount = 32 * 4;

    const composed = composeStl(figureStl, baseStl, 28);
    const composedTris = parseBinaryStl(composed);
    expect(composedTris.length / 9).toBe(FIGURE_TRI_COUNT + baseTriCount);
  });

  it("seats the figure's scaled minY exactly on the base's maxY, with no x/z drift", () => {
    const figureStl = writeBinaryStl([FIGURE_TRIS]);
    const baseStl = generateCylinderStl(12.5, 3.5, 32);
    const baseHeight = stlBounds(parseBinaryStl(baseStl)).max[1];

    const composed = composeStl(figureStl, baseStl, 28);
    const composedTris = parseBinaryStl(composed);
    const figurePortion = composedTris.subarray(0, FIGURE_TRI_COUNT * 9);
    const figureBoundsComposed = stlBounds(figurePortion);

    expect(figureBoundsComposed.min[1]).toBeCloseTo(baseHeight, 4);
    const centerX = (figureBoundsComposed.min[0] + figureBoundsComposed.max[0]) / 2;
    const centerZ = (figureBoundsComposed.min[2] + figureBoundsComposed.max[2]) / 2;
    expect(centerX).toBeCloseTo(0, 4);
    expect(centerZ).toBeCloseTo(0, 4);
  });

  it("applies the same clamp as figureScaleFor (a huge figure caps at 60mm tall)", () => {
    // A figure 10m tall (way past the ceiling at 28mm scale).
    const hugeFigure = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 10, 1,
      0, 0, 0, 1, 10, 1, 0, 10, 1,
    ]);
    const figureStl = writeBinaryStl([hugeFigure]);
    const baseStl = generateCylinderStl(12.5, 3.5, 8);
    const baseHeight = stlBounds(parseBinaryStl(baseStl)).max[1];

    const composed = composeStl(figureStl, baseStl, 28);
    const figurePortion = parseBinaryStl(composed).subarray(0, (hugeFigure.length / 9) * 9);
    const bounds = stlBounds(figurePortion);
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(FIGURE_HEIGHT_CLAMP_MM.max, 4);
    expect(bounds.min[1]).toBeCloseTo(baseHeight, 4);
  });
});
