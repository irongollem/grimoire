import { describe, expect, it } from "vitest";
import { drawHazardGlyph, isHazardCategory, type HazardCategory } from "./hazardPlaceholders";
import { HAZARD_GLYPH_CATEGORY, GENERIC_HAZARD_CATEGORY } from "./glyphs";
import { HAZARD_GLYPHS } from "@/types/trap.types";

// A generic recording proxy stands in for CanvasRenderingContext2D: every
// method call is a no-op, but recorded as a trace (method name + any
// fillStyle/strokeStyle in effect at the time) so a test can compare the
// FULL drawing trace between two categories rather than just the first
// colour set — the point of #804 is a different silhouette per glyph, and a
// same-coloured first fill doesn't mean two shapes are actually identical.
function makeSpyCtx(): { ctx: CanvasRenderingContext2D; trace: string[] } {
  const trace: string[] = [];
  const store = new Map<string, unknown>();
  const ctx = new Proxy({}, {
    get(_target, prop) {
      if (prop === "fillStyle" || prop === "strokeStyle") return store.get(prop as string) ?? "";
      if (typeof prop === "string") return (...args: unknown[]) => { trace.push(`${prop}(${args.join(",")})`); };
      return undefined;
    },
    set(_target, prop, value) {
      store.set(prop as string, value);
      if (prop === "fillStyle" || prop === "strokeStyle") trace.push(`${String(prop)}=${value as string}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, trace };
}

const ALL_HAZARD_CATEGORIES: HazardCategory[] = [
  ...Object.values(HAZARD_GLYPH_CATEGORY),
  GENERIC_HAZARD_CATEGORY,
] as HazardCategory[];

describe("drawHazardGlyph", () => {
  it("draws every declared hazard category without throwing, and paints something", () => {
    for (const category of ALL_HAZARD_CATEGORIES) {
      const { ctx, trace } = makeSpyCtx();
      expect(() => drawHazardGlyph(ctx, category, [100, 100, 100])).not.toThrow();
      expect(trace.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly one category per declared hazard glyph, plus the generic marker", () => {
    expect(ALL_HAZARD_CATEGORIES).toHaveLength(HAZARD_GLYPHS.length + 1);
    expect(new Set(ALL_HAZARD_CATEGORIES).size).toBe(ALL_HAZARD_CATEGORIES.length);
  });

  it("gives every category a unique drawing trace against the same base colour", () => {
    // Same input colour for all of them — any distinctness left over is
    // purely shape (the requirement: "distinguishable as placeholders").
    const traces = ALL_HAZARD_CATEGORIES.map((category) => {
      const { ctx, trace } = makeSpyCtx();
      drawHazardGlyph(ctx, category, [100, 100, 100]);
      return trace.join("|");
    });

    expect(new Set(traces).size).toBe(traces.length);
  });
});

describe("isHazardCategory", () => {
  it("recognises hazard categories and rejects everything else", () => {
    expect(isHazardCategory("hazardPit")).toBe(true);
    expect(isHazardCategory("featureAltar")).toBe(false);
    expect(isHazardCategory("floor")).toBe(false);
  });
});
