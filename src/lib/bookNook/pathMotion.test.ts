import { describe, expect, it } from "vitest";
import { pathSampler } from "./pathMotion.ts";
import { poseAt, type Layer, type Motion, type Scene } from "./scene.ts";
import { resizeLayer } from "./edit.ts";

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

const layerWith = (motions: Motion[], over: Partial<Layer> = {}): Layer => ({
  kind: "layer", id: "apple", src: "apple.png", depth: 1, anchor: { x: 0.5, y: 0.5 }, at: { x: 500, y: 500 }, width: 100, motions, ...over,
});
const sceneWith = (layer: Layer): Scene => ({
  id: "s", title: "S", size: { width: 1000, height: 1000 }, loop: 10, camera: { drift: 0, push: 0 }, seed: 1, grade: {}, stack: [layer],
} as Scene);
const path = (over: Partial<Extract<Motion, { kind: "path" }>> = {}): Motion => ({ kind: "path", points: SQUARE, period: 10, ...over });
const at = (m: Motion, t: number) => {
  const scene = sceneWith(layerWith([m]));
  return poseAt(scene, scene.stack[0] as Layer, t);
};

describe("pathSampler", () => {
  it("passes through every point the maker placed (fails if the curve cuts the corners)", () => {
    const s = pathSampler(SQUARE, true);
    // A closed square's points are a quarter of the way apart only if the sides are equal in arc length, which a
    // spline makes near, not exact: search the curve for the closest approach instead.
    for (const p of SQUARE) {
      let best = Infinity;
      for (let i = 0; i <= 2000; i++) {
        const q = s(i / 2000);
        best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
      }
      expect(best).toBeLessThan(0.5);
    }
  });

  it("moves at a steady speed (fails if the curve is stepped by point instead of by length)", () => {
    // Points unevenly spaced: stepping by index would crawl through the short stretch and race the long one.
    const s = pathSampler([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 400, y: 0 }], false);
    const steps = 200;
    const dists: number[] = [];
    for (let i = 0; i < steps / 2 - 1; i++) {
      const a = s(i / steps);
      const b = s((i + 1) / steps);
      dists.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    expect(Math.max(...dists) / Math.min(...dists)).toBeLessThan(1.15);
  });

  it("joins up at the end of a closed loop (fails if the last stretch back to the first point is missing)", () => {
    const s = pathSampler(SQUARE, true);
    const end = s(0.999999);
    expect(Math.hypot(end.x - s(0).x, end.y - s(0).y)).toBeLessThan(0.1);
  });

  it("an open path goes to the last point at half a cycle and returns to the first (fails if it jumps back)", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }];
    const s = pathSampler(pts, false);
    expect(s(0.5)).toMatchObject({ x: 200, y: 0 });
    expect(s(0)).toMatchObject({ x: 0, y: 0 });
    let worst = 0;
    for (let i = 0; i < 1000; i++) {
      const a = s(i / 1000);
      const b = s((i + 1) / 1000);
      worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
    }
    expect(worst).toBeLessThan(2);
    const back = s(0.75);
    const there = s(0.25);
    expect(back.x).toBeCloseTo(there.x, 3);
    expect(back.y).toBeCloseTo(there.y, 3);
  });

  it("works with two points (a straight line) and seamlessly", () => {
    const s = pathSampler([{ x: 0, y: 0 }, { x: 100, y: 0 }], false);
    expect(s(0.25).x).toBeCloseTo(50, 3);
    expect(s(0.25).y).toBeCloseTo(0, 6);
    expect(s(0.999999).x).toBeCloseTo(0, 1);
  });

  it("reports the heading, and reverses it on the way back of an open path", () => {
    const s = pathSampler([{ x: 0, y: 0 }, { x: 100, y: 0 }], false);
    expect(s(0.25).angle).toBeCloseTo(0, 6);
    expect(Math.cos(s(0.75).angle)).toBeCloseTo(-1, 6);
  });

  it("refuses fewer than two points", () => {
    expect(() => pathSampler([{ x: 0, y: 0 }], true)).toThrow();
  });
});

describe("a path motion in poseAt", () => {
  it("repeats exactly at the end of the loop (fails if the period is not rounded to whole cycles)", () => {
    const m = path({ period: 3.7 });
    const a = at(m, 0);
    const b = at(m, 10);
    expect(b.dx).toBeCloseTo(a.dx, 6);
    expect(b.dy).toBeCloseTo(a.dy, 6);
  });

  it("an open path also closes at the loop's end", () => {
    const m = path({ closed: false, period: 5 });
    expect(at(m, 10).dx).toBeCloseTo(at(m, 0).dx, 6);
    expect(at(m, 10).dy).toBeCloseTo(at(m, 0).dy, 6);
  });

  it("phase spreads parts along one path (fails if phase is ignored)", () => {
    const poses = [0, 0.2, 0.4, 0.6, 0.8].map((phase) => at(path({ phase }), 0));
    const keys = new Set(poses.map((p) => `${p.dx.toFixed(2)},${p.dy.toFixed(2)}`));
    expect(keys.size).toBe(5);
    // A half-cycle phase is the same as half a cycle later.
    expect(at(path({ phase: 0.5 }), 0).dx).toBeCloseTo(at(path(), 5).dx, 6);
  });

  it("turns to the way it is going only when asked (fails if turn is ignored or always on)", () => {
    const line = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
    expect(at(path({ points: line, closed: false, turn: true }), 1).rotate).toBeCloseTo(Math.PI / 2, 3);
    expect(at(path({ points: line, closed: false }), 1).rotate).toBe(0);
  });

  it("defaults to closed (fails if the default were open)", () => {
    // A quarter round the closed square is its second point; an open path is only part way along by then.
    expect(at(path(), 2.5).dx).toBeCloseTo(100, 3);
    expect(at(path({ closed: false }), 2.5).dx).not.toBeCloseTo(100, 0);
  });
});

describe("resizing a part with a path", () => {
  it("leaves the path alone (fails if the arc scales with the part)", () => {
    const m = path();
    const scene = resizeLayer(sceneWith(layerWith([m])), "apple", 200);
    expect((scene.stack[0] as Layer).motions).toEqual([m]);
  });
});
