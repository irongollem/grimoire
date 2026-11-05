import { describe, expect, it } from "vitest";
import { particlesAt, RAIN_LEAN, type Particles } from "./particles.ts";
import type { Scene } from "./scene.ts";

const scene: Scene = { id: "p", title: "P", size: { width: 1000, height: 1000 }, loop: 10, camera: { drift: 0, push: 0 }, stack: [], grade: { tint: { color: [0, 0, 0], amount: 0 }, vignette: 0 }, seed: 3 };
const area = { x: 100, y: 200, w: 600, h: 500 };
const effect = (style: Particles["style"]): Particles => ({ kind: "particles", style, area, depth: 1, count: 30, size: [2, 6], opacity: 0.8, color: [255, 255, 255] });
const STYLES: Particles["style"][] = ["embers", "rain", "snow", "fireflies", "leaves"];
const round = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x)));

describe("particlesAt", () => {
  // A trip that is not a whole number per loop jumps where the loop starts again: the seam #1139 forbids.
  it.each(STYLES)("%s is exactly where it was one loop earlier", (style) => {
    for (const t of [0, 1.7, 5, 9.99]) expect(round(particlesAt(scene, effect(style), t + scene.loop))).toEqual(round(particlesAt(scene, effect(style), t)));
  });

  it("rises embers, falls rain and snow, and slants rain the way it falls", () => {
    const y = (style: Particles["style"], t: number) => particlesAt(scene, effect(style), t).map((p) => p.y);
    // 1 s later nothing has wrapped yet for most: compare the means over a short step.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const moved = (style: Particles["style"]) => {
      const before = particlesAt(scene, effect(style), 0.1);
      const after = particlesAt(scene, effect(style), 0.2);
      return mean(after.map((p, i) => p.y - before[i].y).filter((d) => Math.abs(d) < 100));
    };
    expect(moved("embers")).toBeLessThan(0);
    expect(moved("rain")).toBeGreaterThan(0);
    expect(moved("snow")).toBeGreaterThan(0);
    expect(y("rain", 0)).toHaveLength(30);
    expect(particlesAt(scene, effect("rain"), 1)[0].angle).toBeCloseTo(Math.atan(RAIN_LEAN), 9);
  });

  it("keeps every particle of the falling kinds inside the area's rows and fades it out at the wrap", () => {
    for (const style of ["rain", "snow", "leaves", "embers"] as const) {
      for (const p of particlesAt(scene, effect(style), 3.3)) {
        expect(p.y).toBeGreaterThanOrEqual(area.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(area.y + area.h + 1e-9);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it("keeps fireflies near the area and lets them go dark", () => {
    const all = Array.from({ length: 40 }, (_, i) => particlesAt(scene, effect("fireflies"), (i / 40) * scene.loop)).flat();
    expect(all.some((p) => p.alpha === 0)).toBe(true);
    for (const p of all) {
      expect(p.x).toBeGreaterThan(area.x - area.w * 0.11);
      expect(p.x).toBeLessThan(area.x + area.w * 1.11);
    }
  });

  it("gives two effects in different places of the stack different particles", () => {
    expect(particlesAt(scene, effect("snow"), 1, 0)[0].x).not.toBe(particlesAt(scene, effect("snow"), 1, 1)[0].x);
  });
});
