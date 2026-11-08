import { describe, expect, it } from "vitest";
import { particlesAt } from "./particles.ts";
import { castAt } from "./shadows.ts";
import {
  TILT_REACH,
  billowOffset,
  cameraAt,
  frameShift,
  layersOf,
  lightAt,
  motesAt,
  onPlane,
  parallax,
  pathAt,
  poseAt,
  screenFit,
  steamAt,
  uncovered,
  type Effect,
  type Layer,
  type Scene,
} from "./scene.ts";

const layer = (over: Partial<Layer> & { id: string }): Layer => ({
  kind: "layer",
  src: `${over.id}.png`,
  depth: 1,
  anchor: { x: 0.5, y: 0.5 },
  at: { x: 500, y: 1000 },
  width: 100,
  ...over,
});

/** A small made-up room, taller than wide like a Reel frame, with one of everything that moves. */
const ROOM: Scene = {
  id: "test-room",
  title: "Test room",
  size: { width: 1000, height: 2000 },
  loop: 12,
  camera: { drift: 0.012, push: 0.015 },
  seed: 7,
  grade: { tint: { color: [255, 200, 150], amount: 0.2 }, vignette: 0.3 },
  stack: [
    layer({ id: "plate", at: { x: 500, y: 1000 }, width: 1100 }),
    { kind: "light", id: "candle-light", at: { x: 700, y: 900 }, depth: 1, radius: 200, color: [255, 190, 110], intensity: 0.8, follows: "flame" },
    layer({ id: "flame", at: { x: 700, y: 900 }, width: 40, motions: [{ kind: "flicker", amount: 0.09, speed: 2.4 }] }),
    layer({ id: "vase", at: { x: 300, y: 1200 }, width: 120, anchor: { x: 0.5, y: 1 }, cast: { light: "candle-light", depth: 0.95, opacity: 0.5 } }),
    { kind: "steam", at: { x: 400, y: 800 }, depth: 1, count: 6, life: 4, rise: 150, spread: 40, size: [10, 30], opacity: 0.3, color: [200, 200, 200] },
    { kind: "motes", area: { x: 100, y: 100, w: 400, h: 600 }, depth: 1, count: 10, size: [2, 4], opacity: 0.5, color: [255, 235, 190] },
    { kind: "particles", style: "rain", area: { x: 0, y: 0, w: 1000, h: 800 }, depth: 1.4, count: 20, size: [2, 4], opacity: 0.5, color: [190, 200, 220] },
    { kind: "particles", style: "fireflies", area: { x: 0, y: 1200, w: 1000, h: 400 }, depth: 1, count: 8, size: [3, 5], opacity: 0.9, color: [210, 255, 120] },
  ],
};

/** Everything that moves in a scene at `t`, as one comparable value. */
function stateAt(scene: Scene, t: number) {
  return {
    camera: cameraAt(scene, t),
    items: scene.stack.map((item, i) => {
      if (item.kind === "layer") return [poseAt(scene, item, t), item.cast ? castAt(scene, item, t) : null];
      if (item.kind === "steam") return steamAt(scene, item, t, i);
      if (item.kind === "motes") return motesAt(scene, item, t, i);
      if (item.kind === "particles") return particlesAt(scene, item, t, i);
      return lightAt(scene, item, t);
    }),
  };
}

/** Rounds every number so two states compare equal up to floating error. */
const settle = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x)));

describe("a scene's loop", () => {
  // Decision 3 of #1139: loops that repeat without a seam. A period that is not a whole number of cycles
  // per loop, or steam whose age is not taken round the loop, jumps where the loop starts again.
  it.each([0, 0.37, 2.5, ROOM.loop / 2, ROOM.loop - 1 / 30])("is at %s s exactly where it is one loop later", (t) => {
    expect(settle(stateAt(ROOM, t + ROOM.loop))).toEqual(settle(stateAt(ROOM, t)));
  });
});

describe("poseAt", () => {
  it("rounds a period that does not divide the loop to whole cycles, so a 4 s sway in an 11 s loop has no seam", () => {
    const swing = layer({ id: "s", anchor: { x: 0.5, y: 0 }, width: 10, motions: [{ kind: "sway", angle: 3, period: 4 }] });
    const scene: Scene = { ...ROOM, loop: 11, stack: [swing] };
    for (const t of [0, 1.3, 7]) expect(poseAt(scene, swing, t + 11).rotate).toBeCloseTo(poseAt(scene, swing, t).rotate, 9);
  });
});

describe("uncovered", () => {
  it("reports the gap when a plate only just fills a frame the camera drifts across", () => {
    const scene: Scene = { ...ROOM, size: { width: 1080, height: 1920 }, stack: [] };
    const exact = layer({ id: "p", at: { x: 540, y: 960 }, width: 1080 });
    // A quarter into the loop the drift is 1.2 per cent of 1080, 13 px, while the push is halfway (0.75 per
    // cent closer, 4 px more cover at each side): about 9 px of black.
    expect(uncovered(scene, exact, { width: 1080, height: 1920 })).toBeGreaterThan(8);
  });

  it("measures against the window rather than the whole room when given one", () => {
    // A plate exactly the room: a window in the middle is covered with room to spare, one flush with the left
    // edge sees black as soon as the camera drifts right of it.
    const plate = layer({ id: "p", at: { x: 500, y: 1000 }, width: 1000 });
    const scene: Scene = { ...ROOM, camera: { drift: 0.02, push: 0 }, stack: [plate] };
    const image = { width: 1000, height: 2000 };
    expect(uncovered(scene, plate, image, 240, { window: { x: 250, y: 500, w: 500, h: 1000 } })).toBe(0);
    expect(uncovered(scene, plate, image, 240, { window: { x: 0, y: 500, w: 500, h: 1000 } })).toBeGreaterThan(5);
  });

  it("adds the tilt's reach when asked, so a window that is covered while the viewer looks ahead is flagged when they look aside", () => {
    const plate = layer({ id: "p", at: { x: 500, y: 1000 }, width: 1000 });
    const scene: Scene = { ...ROOM, camera: { drift: 0, push: 0 }, stack: [plate] };
    const window = { x: 0, y: 500, w: 500, h: 1000 };
    const image = { width: 1000, height: 2000 };
    expect(uncovered(scene, plate, image, 24, { window })).toBe(0);
    // Looking right moves the world left by 3.5 per cent of the window: 17.5 px off the room's left edge.
    expect(uncovered(scene, plate, image, 24, { window, tilt: true })).toBeCloseTo(TILT_REACH.x * window.w, 6);
  });
});

describe("cameraAt", () => {
  it("moves the world up as the view travels down it", () => {
    const still: Scene = { ...ROOM, camera: { drift: 0, push: 0, path: [{ at: 0, x: 0, y: 500 }] } };
    expect(cameraAt(still, 4).dy).toBeCloseTo(-500, 9);
  });

  it("without a view drifts by the room's width, as every Reel was filmed", () => {
    const a = (2 * Math.PI * 3) / ROOM.loop;
    const camera = cameraAt(ROOM, 3);
    expect(camera.dx).toBeCloseTo(0.012 * 1000 * Math.sin(a), 9);
    expect(camera.dy).toBeCloseTo(0.012 * 1000 * 0.5 * Math.sin(2 * a), 9);
    expect(camera.scale).toBeCloseTo(1 + 0.015 * (0.5 - 0.5 * Math.cos(a)), 9);
  });

  it("through a window drifts by the window's width, and breathing scales drift and push", () => {
    const window = { x: 0, y: 0, w: 400, h: 700 };
    const a = (2 * Math.PI * 3) / ROOM.loop;
    expect(cameraAt(ROOM, 3, { window }).dx).toBeCloseTo(0.012 * 400 * Math.sin(a), 9);
    const calm = cameraAt(ROOM, 3, { window, breathe: 0 });
    expect(calm.dx).toBeCloseTo(0, 9);
    expect(calm.scale).toBe(1);
    expect(cameraAt(ROOM, 3, { window, breathe: 0.5 }).dx).toBeCloseTo(0.5 * cameraAt(ROOM, 3, { window }).dx, 9);
  });

  it("looking right moves the world left, further for the near than the far", () => {
    const window = { x: 0, y: 0, w: 400, h: 700 };
    const still: Scene = { ...ROOM, camera: { drift: 0, push: 0 } };
    const camera = cameraAt(still, 0, { window, tilt: { x: 1, y: -1 } });
    expect(camera.dx).toBeCloseTo(-TILT_REACH.x * 400, 9);
    expect(camera.dy).toBeCloseTo(TILT_REACH.y * 700, 9);
    expect(Math.abs(parallax(camera, 1.4).dx)).toBeGreaterThan(Math.abs(parallax(camera, 0.3).dx));
  });
});

describe("screenFit", () => {
  it("is the identity on the room without a view, so the promo draws as before", () => {
    expect(screenFit(ROOM, ROOM.size)).toEqual({ scale: 1, centre: { x: 500, y: 1000 }, origin: { x: 500, y: 1000 } });
  });

  it("cover-fits the window to the canvas and centres it on the window's middle", () => {
    const fit = screenFit(ROOM, { width: 1600, height: 900 }, { window: { x: 100, y: 200, w: 800, h: 400 } });
    // 2 across, 2.25 down: the window's height fills the canvas and its sides overflow.
    expect(fit.scale).toBe(2.25);
    expect(fit.centre).toEqual({ x: 500, y: 400 });
    expect(fit.origin).toEqual({ x: 800, y: 450 });
  });
});

describe("billowOffset", () => {
  it("never moves the cloth at its rod, and swings its hem", () => {
    for (const phase of [0, 1, 2.5, 4]) expect(billowOffset({ amount: 16, phase, waves: 0.8 }, 0)).toBeCloseTo(0, 9);
    const hem = [0, 1, 2.5, 4].map((phase) => Math.abs(billowOffset({ amount: 16, phase, waves: 0.8 }, 1)));
    expect(Math.max(...hem)).toBeGreaterThan(8);
  });
});

describe("frameShift", () => {
  const pan = [
    { at: 0, x: -1200, y: 0 },
    { at: 4, x: -1200, y: 0 },
    { at: 10, x: 900, y: 0 },
  ];
  const panning = (follow?: number): Scene => ({
    ...ROOM,
    camera: { drift: 0, push: 0, path: pan },
    frame: { style: "stone-bars", tall: "bars.png", ...(follow === undefined ? {} : { follow }) },
  });

  // Book Nook's rule (#1142): a frame never moves. Only a scene that asks for it (a Reel craning past bars) slides.
  it("keeps a frame that does not follow still, however far the view travels", () => {
    expect(frameShift(panning(), 8)).toEqual({ dx: 0, dy: 0, mx: 0, my: 0 });
  });

  it("slides the frame the way the view goes, by its share of the path", () => {
    expect(frameShift(panning(0.04), 2).dx).toBeCloseTo(-48, 9);
    expect(frameShift(panning(0.04), 10).dx).toBeCloseTo(36, 9);
  });

  // Bug it fails on: an oversize margin smaller than the slide shows the screen's edge past the frame at the ends.
  it("fits the frame larger than the screen by at least as far as it ever slides", () => {
    const scene = panning(0.04);
    const { mx } = frameShift(scene, 0);
    for (let t = 0; t < scene.loop; t += 0.25) expect(Math.abs(frameShift(scene, t).dx)).toBeLessThanOrEqual(mx);
    expect(mx).toBe(48);
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
  const light = ROOM.stack.find((i): i is Extract<Effect, { kind: "light" }> => i.kind === "light");

  it("refuses to follow a layer that has no flicker, rather than shining steadily by mistake", () => {
    expect(() => lightAt(ROOM, { kind: "light", at: { x: 0, y: 0 }, depth: 1, radius: 10, color: [255, 255, 255], intensity: 1, follows: "vase" }, 0)).toThrow(/no flicker/);
  });

  it("wavers around its intensity when it follows a flame", () => {
    if (!light) throw new Error("the test room has no light");
    const values = Array.from({ length: 60 }, (_, i) => lightAt(ROOM, light, (i / 60) * ROOM.loop));
    expect(Math.max(...values)).toBeGreaterThan(light.intensity);
    expect(Math.min(...values)).toBeLessThan(light.intensity);
    expect(layersOf(ROOM).some((l) => l.id === light.follows)).toBe(true);
  });
});
