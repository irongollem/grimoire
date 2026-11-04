import { describe, expect, it } from "vitest";
import { SCENES } from "./catalog.ts";
import { INN_PLATE, innDawn } from "./inn-dawn.ts";
import { billowOffset, cameraAt, layersOf, lightAt, motesAt, onPlane, pathAt, poseAt, steamAt, uncovered, type Effect, type Layer, type Scene } from "./scene.ts";

/** Everything that moves in a scene at `t`, as one comparable value. */
function stateAt(scene: Scene, t: number) {
  return {
    camera: cameraAt(scene, t),
    items: scene.stack.map((item, i) =>
      item.kind === "layer"
        ? poseAt(scene, item, t)
        : item.kind === "steam"
          ? steamAt(scene, item, t, i)
          : item.kind === "motes"
            ? motesAt(scene, item, t, i)
            : lightAt(scene, item, t),
    ),
  };
}

/** Rounds every number so two states compare equal up to floating error. */
const settle = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x)));

describe.each(SCENES.map((s) => [s.id, s] as const))("scene %s", (_, scene) => {
  // Decision 3 of #1139: loops that repeat without a seam. A period that is not a whole number of cycles
  // per loop, or steam whose age is not taken round the loop, jumps where the loop starts again.
  it.each([0, 0.37, 2.5, scene.loop / 2, scene.loop - 1 / 30])("is at %s s exactly where it is one loop later", (t) => {
    expect(settle(stateAt(scene, t + scene.loop))).toEqual(settle(stateAt(scene, t)));
  });
});

// The maintainer's ruling on Cup Town (4 Nov 2026): the question first, long enough to read on its own, then the
// setting's subtitle under it. A tagline that starts with its title, or outlives it, breaks that order.
describe.each(SCENES.flatMap((s) => (s.tagline ? [[s.id, s, s.tagline] as const] : [])))("scene %s tagline", (_, scene, tagline) => {
  it("arrives at least two seconds after the title and leaves no later than it, inside the shot", () => {
    const [titleFrom, titleTo] = scene.captionAt ?? [0, scene.duration];
    const [from, to] = tagline.at;
    expect(from - titleFrom).toBeGreaterThanOrEqual(2);
    expect(to).toBeLessThanOrEqual(titleTo);
    expect(to).toBeLessThanOrEqual(scene.duration);
  });
});

describe("poseAt", () => {
  it("rounds a period that does not divide the loop to whole cycles, so a 4 s sway in an 11 s loop has no seam", () => {
    const swing: Layer = { kind: "layer", id: "s", src: "s.png", depth: 1, anchor: { x: 0.5, y: 0 }, at: { x: 0, y: 0 }, width: 10, motions: [{ kind: "sway", angle: 3, period: 4 }] };
    const scene: Scene = { ...innDawn, loop: 11, stack: [swing] };
    for (const t of [0, 1.3, 7]) expect(poseAt(scene, swing, t + 11).rotate).toBeCloseTo(poseAt(scene, swing, t).rotate, 9);
  });
});

describe("inn-dawn", () => {
  // The plate is briefed at 1024x1536 (~/Desktop/art-955/scenes/briefs.json); drawn too small, the camera's
  // drift shows black at the frame's edge.
  it("keeps the plate over the whole frame however far the camera drifts", () => {
    const plate = layersOf(innDawn).find((l) => l.id === "plate") as Layer;
    expect(uncovered(innDawn, plate, INN_PLATE)).toBe(0);
  });
});

describe("uncovered", () => {
  it("reports the gap when a plate only just fills a frame the camera drifts across", () => {
    const scene: Scene = { ...innDawn, stack: [] };
    const exact: Layer = { kind: "layer", id: "p", src: "p.png", depth: 1, anchor: { x: 0.5, y: 0.5 }, at: { x: 540, y: 960 }, width: 1080 };
    // A quarter into the loop the drift is 1.2 per cent of 1080, 13 px, while the push is halfway (0.75 per
    // cent closer, 4 px more cover at each side): about 9 px of black.
    expect(uncovered(scene, exact, { width: 1080, height: 1920 })).toBeGreaterThan(8);
  });
});

describe("billowOffset", () => {
  it("never moves the cloth at its rod, and swings its hem", () => {
    for (const phase of [0, 1, 2.5, 4]) expect(billowOffset({ amount: 16, phase, waves: 0.8 }, 0)).toBeCloseTo(0, 9);
    const hem = [0, 1, 2.5, 4].map((phase) => Math.abs(billowOffset({ amount: 16, phase, waves: 0.8 }, 1)));
    expect(Math.max(...hem)).toBeGreaterThan(8);
  });
});

describe("pathAt", () => {
  // A tilt: hold on the picnic, rise to the town, hold, and come back by the loop's end.
  const loop = 24;
  const path = [
    { at: 0, x: 0, y: 600 },
    { at: 3, x: 0, y: 600 },
    { at: 10, x: 0, y: -400 },
    { at: 16, x: 0, y: -400 },
  ];

  it("is at each point at its time and holds between two equal points", () => {
    expect(pathAt(path, loop, 3).y).toBeCloseTo(600, 9);
    expect(pathAt(path, loop, 10).y).toBeCloseTo(-400, 9);
    expect(pathAt(path, loop, 13).y).toBeCloseTo(-400, 9);
    // Halfway through the rise, smoothstep is exactly halfway.
    expect(pathAt(path, loop, 6.5).y).toBeCloseTo(100, 9);
  });

  it("eases from the last point back to the first by the loop's end, so the loop closes", () => {
    // From 16 s to 24 s it travels from -400 back to 600: halfway at 20 s, and almost home just before 24 s.
    expect(pathAt(path, loop, 20).y).toBeCloseTo(100, 9);
    expect(pathAt(path, loop, loop - 0.001).y).toBeCloseTo(600, 3);
    expect(pathAt(path, loop, loop + 3).y).toBeCloseTo(600, 9);
  });

  it("wraps into a path whose first point comes after the loop's start", () => {
    // Points at 2 s (y 0) and 8 s (y 120), loop 12: from 8 s round to 14 s (2 s next loop) it travels 120 back to
    // 0, so at 11 s (halfway) it is at 60, and at 1 s, 5/6 of the way, smoothstep gives 120 - 120 * 0.926 = 8.9.
    const late = [{ at: 2, x: 0, y: 0 }, { at: 8, x: 0, y: 120 }];
    expect(pathAt(late, 12, 11).y).toBeCloseTo(60, 9);
    expect(pathAt(late, 12, 1).y).toBeCloseTo(120 - 120 * ((5 / 6) ** 2 * (3 - 2 * (5 / 6))), 9);
  });
});

describe("cameraAt", () => {
  it("moves the world up as the view travels down it", () => {
    const still: Scene = { ...innDawn, camera: { drift: 0, push: 0, path: [{ at: 0, x: 0, y: 500 }] } };
    expect(cameraAt(still, 4).dy).toBeCloseTo(-500, 9);
  });
});

describe("onPlane", () => {
  // The inn's window wall: eye level at y 620, the far edge 0.9 as tall as the near one.
  const wall = { horizon: 620, far: 0.9 };

  it("leaves the near edge and the eye level where they are", () => {
    expect(onPlane(wall, 0, 40)).toBe(40);
    expect(onPlane(wall, 1, 620)).toBe(620);
  });

  it("brings the far edge's top down and its bottom up, toward the eye level", () => {
    // 580 px above the eye level shrinks by a tenth to 522: the top lands at 98, not 40.
    expect(onPlane(wall, 1, 40)).toBeCloseTo(98, 9);
    expect(onPlane(wall, 1, 1020)).toBeCloseTo(980, 9);
  });
});

describe("lightAt", () => {
  const light = innDawn.stack.find((i): i is Extract<Effect, { kind: "light" }> => i.kind === "light" && i.follows === "flame");
  const flame = layersOf(innDawn).find((l) => l.id === "flame") as Layer;

  it("brightens as its flame stretches: the candle's light flickers with the candle", () => {
    if (!light) throw new Error("inn-dawn has no light following its flame");
    const ts = Array.from({ length: 330 }, (_, i) => (i / 330) * innDawn.loop);
    const tall = ts.map((t) => poseAt(innDawn, flame, t).scaleY - 1);
    const bright = ts.map((t) => lightAt(innDawn, light, t) - light.intensity);
    const dot = tall.reduce((s, x, i) => s + x * bright[i], 0);
    const norm = Math.hypot(...tall) * Math.hypot(...bright);
    expect(dot / norm).toBeGreaterThan(0.95);
  });

  it("refuses to follow a layer that has no flicker, rather than shining steadily by mistake", () => {
    expect(() => lightAt(innDawn, { kind: "light", at: { x: 0, y: 0 }, depth: 1, radius: 10, color: [255, 255, 255], intensity: 1, follows: "kettle" }, 0)).toThrow(
      /no flicker/,
    );
  });
});
