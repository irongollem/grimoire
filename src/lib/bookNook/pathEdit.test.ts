import { describe, expect, it } from "vitest";
import { addCutout, newScene } from "./edit.ts";
import { curveThrough, hitPoint, offsetToScreen, screenToOffset, simplifyLine, strokeToPoints, withPathsResting } from "./pathEdit.ts";
import { layersOf } from "./scene.ts";
import type { Projector } from "./stageGeometry.ts";

// A stage twice the room's size, shifted: enough that a conversion which forgets the layer's `at`, or the scale, is wrong.
const projector: Projector = {
  toScreen: (p) => ({ x: p.x * 2 + 10, y: p.y * 2 + 20 }),
  toRoom: (p) => ({ x: (p.x - 10) / 2, y: (p.y - 20) / 2 }),
  lengthScale: () => 2,
};
const layer = { at: { x: 100, y: 50 }, depth: 1 };

describe("offsetToScreen and screenToOffset", () => {
  it("measure an offset from where the cut-out is placed, and undo each other", () => {
    // Bug: points taken from the room's corner instead of the layer's `at`, so every path is displaced by `at`.
    expect(offsetToScreen(projector, layer, { x: 0, y: 0 })).toEqual({ x: 210, y: 120 });
    expect(offsetToScreen(projector, layer, { x: 10, y: -5 })).toEqual({ x: 230, y: 110 });
    expect(screenToOffset(projector, layer, { x: 230, y: 110 })).toEqual({ x: 10, y: -5 });
  });
});

describe("hitPoint", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 40, y: 0 }];
  it("finds the nearest point within the radius, and none beyond it", () => {
    // Bug: the first point in range wins over the nearer one, so two close points cannot be told apart.
    expect(hitPoint(points, { x: 8, y: 0 }, 6)).toBe(1);
    expect(hitPoint(points, { x: 4, y: 0 }, 6)).toBe(0);
    expect(hitPoint(points, { x: 25, y: 0 }, 6)).toBe(-1);
  });
});

describe("simplifyLine", () => {
  it("drops points on a straight run and keeps the corner", () => {
    // Bug: a straight stroke keeps every sample, or a corner is dropped and the path cuts it.
    const line = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }];
    expect(simplifyLine(line, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });
  it("always keeps both ends", () => {
    const wobble = [{ x: 0, y: 0 }, { x: 5, y: 0.1 }, { x: 10, y: 0 }];
    expect(simplifyLine(wobble, 5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });
});

describe("strokeToPoints", () => {
  const circle = Array.from({ length: 400 }, (_, i) => ({ x: 100 * Math.cos((i / 400) * 2 * Math.PI), y: 100 * Math.sin((i / 400) * 2 * Math.PI) }));
  it("thins hundreds of samples to no more than the cap, ends included", () => {
    // Bug: every pointer move becomes a point, so a path is hundreds of handles.
    const points = strokeToPoints(circle, 1, 12);
    expect(points.length).toBeLessThanOrEqual(12);
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(points[0]).toEqual(circle[0]);
    expect(points[points.length - 1]).toEqual(circle[circle.length - 1]);
  });
  it("keeps the cap even when the tolerance alone would leave more", () => {
    // Bug: the cap ignored, so a fine tolerance on a wiggly stroke gives dozens.
    const wiggle = Array.from({ length: 200 }, (_, i) => ({ x: i * 3, y: i % 2 === 0 ? 0 : 20 }));
    expect(strokeToPoints(wiggle, 0.1, 8).length).toBeLessThanOrEqual(8);
  });
  it("ends on the last sample even when it is closer than a step", () => {
    const stroke = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100.5, y: 0 }];
    expect(strokeToPoints(stroke, 1, 12, 2).at(-1)).toEqual({ x: 100.5, y: 0 });
  });
});

describe("curveThrough", () => {
  const four = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  it("is the curve, not straight lines: it bows away from the chord between points", () => {
    // Bug: the overlay joins points with straight segments while the engine follows a spline.
    const line = curveThrough(four, true, 120);
    const nearCorner = line.some((p) => p.x > 100.5 || p.y < -0.5 || p.x < -0.5 || p.y > 100.5);
    expect(nearCorner).toBe(true);
    expect(line[0]).toEqual(expect.objectContaining({ x: 0, y: 0 }));
  });
  it("closes back on its first point when round, and ends on the last when there and back", () => {
    // Bug: an open path sampled over the whole cycle, which comes back along itself and ends at the start.
    const round = curveThrough(four, true);
    expect(round.at(-1)?.x).toBeCloseTo(0, 5);
    expect(round.at(-1)?.y).toBeCloseTo(0, 5);
    const open = curveThrough(four, false);
    expect(open.at(-1)?.x).toBeCloseTo(0, 3);
    expect(open.at(-1)?.y).toBeCloseTo(100, 3);
  });
  it("returns what it was given when there is no curve yet", () => {
    // Bug: one point throws "needs at least two points" while the maker is still drawing.
    expect(curveThrough([{ x: 3, y: 4 }], true)).toEqual([{ x: 3, y: 4 }]);
    expect(curveThrough([], false)).toEqual([]);
  });
});

describe("withPathsResting", () => {
  const room = newScene({ id: "n", title: "N", room: { url: "r", width: 2400, height: 1350 } });
  const withApple = addCutout(room, { id: "apple-abc123", src: "a", width: 100, height: 100 }, { x: 1, y: 1 });
  const moving = {
    ...withApple,
    stack: withApple.stack.map((i) =>
      i.kind === "layer" && i.id === "apple-abc123"
        ? { ...i, motions: [{ kind: "flicker" as const, amount: 0.1, speed: 2 }, { kind: "path" as const, points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], period: 4 }, { kind: "spin" as const, period: 4 }] }
        : i,
    ),
  };
  const apple = (s: typeof room) => layersOf(s).find((l) => l.id === "apple-abc123");

  it("stills the layer's path and keeps every other motion in its place", () => {
    // Bug: the part keeps travelling while its points are edited, so they never line up with it; or removing the
    // path shifts the flame's index and its flicker changes.
    const resting = apple(withPathsResting(moving, "apple-abc123"));
    expect(resting?.motions?.map((m) => m.kind)).toEqual(["flicker", "path", "spin"]);
    expect(resting?.motions?.[1]).toEqual(expect.objectContaining({ points: [] }));
  });
  it("leaves the scene as it was, and other layers alone", () => {
    // Bug: the editing view writes into the saved scene.
    withPathsResting(moving, "apple-abc123");
    const before = apple(moving)?.motions?.[1];
    expect(before && "points" in before ? before.points : []).toHaveLength(2);
    expect(withPathsResting(moving, "another")).toEqual(moving);
  });
});
