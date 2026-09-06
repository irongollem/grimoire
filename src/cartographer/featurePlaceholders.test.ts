import { describe, expect, it } from "vitest";
import { drawFeatureGlyph, isFeatureCategory, type FeatureCategory } from "./featurePlaceholders";
import { FEATURE_GLYPH_CATEGORY, GENERIC_FEATURE_CATEGORY } from "./glyphs";
import { FEATURE_GLYPHS } from "@/types/dungeonFeature.types";

// Same recording-proxy approach as hazardPlaceholders.test.ts — traces the
// full call sequence (not just the first fillStyle) so two shapes that
// happen to start with the same fill colour still compare as distinct.
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

const ALL_FEATURE_CATEGORIES: FeatureCategory[] = [
  ...Object.values(FEATURE_GLYPH_CATEGORY),
  GENERIC_FEATURE_CATEGORY,
] as FeatureCategory[];

describe("drawFeatureGlyph", () => {
  it("draws every declared feature category without throwing, and paints something", () => {
    for (const category of ALL_FEATURE_CATEGORIES) {
      const { ctx, trace } = makeSpyCtx();
      expect(() => drawFeatureGlyph(ctx, category, [100, 100, 100])).not.toThrow();
      expect(trace.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly one category per declared feature glyph, plus the generic marker", () => {
    expect(ALL_FEATURE_CATEGORIES).toHaveLength(FEATURE_GLYPHS.length + 1);
    expect(new Set(ALL_FEATURE_CATEGORIES).size).toBe(ALL_FEATURE_CATEGORIES.length);
  });

  it("gives every category a unique drawing trace against the same base colour", () => {
    const traces = ALL_FEATURE_CATEGORIES.map((category) => {
      const { ctx, trace } = makeSpyCtx();
      drawFeatureGlyph(ctx, category, [100, 100, 100]);
      return trace.join("|");
    });

    expect(new Set(traces).size).toBe(traces.length);
  });
});

describe("isFeatureCategory", () => {
  it("recognises feature categories and rejects everything else", () => {
    expect(isFeatureCategory("featureAltar")).toBe(true);
    expect(isFeatureCategory("hazardPit")).toBe(false);
    expect(isFeatureCategory("floor")).toBe(false);
  });
});
