import { describe, expect, it } from "vitest";
import { castAt } from "./shadows.ts";
import type { Layer, Scene } from "./scene.ts";

const vase = (over: Partial<Layer> = {}): Layer => ({ kind: "layer", id: "vase", src: "v.png", depth: 1, anchor: { x: 0.5, y: 1 }, at: { x: 500, y: 900 }, width: 100, cast: { light: "lamp", depth: 0.95, opacity: 0.5 }, ...over });
const scene = (lightAt: { x: number; y: number }, follows?: string, layers: Layer[] = [vase()]): Scene => ({
  id: "s",
  title: "S",
  size: { width: 1000, height: 1000 },
  loop: 12,
  camera: { drift: 0, push: 0 },
  grade: { tint: { color: [0, 0, 0], amount: 0 }, vignette: 0 },
  seed: 1,
  stack: [
    { kind: "light", id: "lamp", at: lightAt, depth: 1, radius: 200, color: [255, 200, 120], intensity: 1, follows },
    { kind: "layer", id: "flame", src: "f.png", depth: 1, anchor: { x: 0.5, y: 1 }, at: lightAt, width: 20, motions: [{ kind: "flicker", amount: 0.1, speed: 2.4 }] },
    ...layers,
  ],
});

describe("castAt", () => {
  it("leans left when the light is to the right, and right when it is to the left: away from the light", () => {
    expect(castAt(scene({ x: 800, y: 700 }), vase(), 0).skew).toBeLessThan(0);
    expect(castAt(scene({ x: 200, y: 700 }), vase(), 0).skew).toBeGreaterThan(0);
  });

  it("leans at most 0.9, however low and far the light sits", () => {
    expect(castAt(scene({ x: 5000, y: 900 }), vase(), 0).skew).toBeCloseTo(-0.9, 9);
  });

  it("names the light it cannot find, rather than casting nothing", () => {
    const orphan = vase({ cast: { light: "sun", depth: 0.9, opacity: 0.5 } });
    expect(() => castAt(scene({ x: 800, y: 700 }, undefined, [orphan]), orphan, 0)).toThrow(/light "sun"/);
  });

  it("is steady under a steady light and wavers with a flame it follows", () => {
    const steady = Array.from({ length: 20 }, (_, i) => castAt(scene({ x: 800, y: 700 }), vase(), i));
    expect(new Set(steady.map((c) => c.scaleY))).toEqual(new Set([1]));
    const lit = scene({ x: 800, y: 700 }, "flame");
    const waver = Array.from({ length: 60 }, (_, i) => castAt(lit, vase(), (i / 60) * 12));
    expect(Math.max(...waver.map((c) => c.scaleY))).toBeGreaterThan(1.01);
    expect(Math.min(...waver.map((c) => c.scaleY))).toBeLessThan(0.99);
    expect(Math.max(...waver.map((c) => c.alpha))).toBeLessThanOrEqual(1);
  });

  it("repeats exactly once the loop has passed, so the shadow has no seam", () => {
    const lit = scene({ x: 800, y: 700 }, "flame");
    for (const t of [0, 3.3, 11.9]) {
      const a = castAt(lit, vase(), t);
      const b = castAt(lit, vase(), t + 12);
      expect(b.scaleY).toBeCloseTo(a.scaleY, 9);
      expect(b.alpha).toBeCloseTo(a.alpha, 9);
    }
  });
});
