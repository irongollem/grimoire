import { describe, expect, it } from "vitest";
import { cameraAt, layersOf, lightAt, motesAt, poseAt, steamAt, uncovered, type Effect, type Layer, type Scene } from "../../../src/lib/bookNook/scene.ts";
import { SCENES } from "./catalog.ts";
import { INN_PLATE, innDawn } from "./inn-dawn.ts";
import { runsToEnd } from "./reel.ts";

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
            : item.kind === "light"
              ? lightAt(scene, item, t)
              : null,
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

describe("inn-dawn", () => {
  // The plate is briefed at 1024x1536 (~/Desktop/art-955/scenes/briefs.json); drawn too small, the camera's
  // drift shows black at the frame's edge.
  it("keeps the plate over the whole frame however far the camera drifts", () => {
    const plate = layersOf(innDawn).find((l) => l.id === "plate") as Layer;
    expect(uncovered(innDawn, plate, INN_PLATE)).toBe(0);
  });

  it("brightens the candle's light as its flame stretches: the light flickers with the candle", () => {
    const light = innDawn.stack.find((i): i is Extract<Effect, { kind: "light" }> => i.kind === "light" && i.follows === "flame");
    const flame = layersOf(innDawn).find((l) => l.id === "flame") as Layer;
    if (!light) throw new Error("inn-dawn has no light following its flame");
    const ts = Array.from({ length: 330 }, (_, i) => (i / 330) * innDawn.loop);
    const tall = ts.map((t) => poseAt(innDawn, flame, t).scaleY - 1);
    const bright = ts.map((t) => lightAt(innDawn, light, t) - light.intensity);
    const dot = tall.reduce((s, x, i) => s + x * bright[i], 0);
    const norm = Math.hypot(...tall) * Math.hypot(...bright);
    expect(dot / norm).toBeGreaterThan(0.95);
  });
});

describe("runsToEnd", () => {
  // Cup Town, 4 Nov 2026: the song's clip, written as start + loop, floated a hair short of the shot, faded out
  // over its last 0.6 s and stopped at every loop.
  it("counts a clip written as start + loop as reaching the end, though it floats a hair short", () => {
    const loop = 680 / 30;
    expect(151 + loop - 151).toBeLessThan(loop);
    expect(runsToEnd(0, [151, 151 + loop], loop)).toBe(true);
  });

  it("does not count a clip a frame short of the end, so a bell still fades out", () => {
    expect(runsToEnd(10.5, [0, 8.76], 22)).toBe(false);
    expect(runsToEnd(0, [0, 24 - 1 / 30], 24)).toBe(false);
  });
});
