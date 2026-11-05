import { describe, expect, it } from "vitest";
import { checkWindow, cutSides, windowFor, type Side } from "./framing.ts";
import type { Layer, Scene } from "./scene.ts";

const layer = (over: Partial<Layer> & { id: string }): Layer => ({ kind: "layer", src: `${over.id}.png`, depth: 1, anchor: { x: 0.5, y: 0.5 }, at: { x: 500, y: 500 }, width: 100, ...over });
const room = (layers: Layer[], drift = 0): Scene => ({
  id: "r",
  title: "R",
  size: { width: 1000, height: 1000 },
  loop: 12,
  camera: { drift, push: 0 },
  grade: { tint: { color: [0, 0, 0], amount: 0 }, vignette: 0 },
  seed: 1,
  stack: layers,
});
const PLATE = layer({ id: "plate", width: 1000 });
const sizes = new Map([["plate", { width: 1000, height: 1000 }], ["chair", { width: 100, height: 100 }]]);
const window = { x: 200, y: 200, w: 600, h: 600 };

describe("cutSides", () => {
  it("names the edges an opaque pixel touches, and ignores faint ones", () => {
    // 3x3, opaque only in the bottom row, with a faint stray pixel on the top row.
    const alpha = new Uint8ClampedArray([4, 0, 0, 0, 0, 0, 255, 255, 255]);
    expect(cutSides(alpha, 3, 3).sort()).toEqual(["bottom", "left", "right"]);
  });
});

describe("checkWindow", () => {
  it("is clean for a covered window and a part whose cut edge is off the window", () => {
    const chair = layer({ id: "chair", at: { x: 500, y: 850 }, anchor: { x: 0.5, y: 1 } });
    // Its bottom cut at y 850, in a window ending at 800: below the window, so nothing shows.
    expect(checkWindow(room([PLATE, chair]), sizes, new Map<string, Side[]>([["chair", ["bottom"]]]), window, { tilt: false })).toEqual([]);
  });

  it("flags a part cut off above the floor inside the window as floating, naming the side", () => {
    const chair = layer({ id: "chair", at: { x: 500, y: 600 }, anchor: { x: 0.5, y: 1 } });
    expect(checkWindow(room([PLATE, chair]), sizes, new Map<string, Side[]>([["chair", ["bottom"]]]), window, { tilt: false })).toEqual([{ kind: "floating", layerId: "chair", side: "bottom" }]);
  });

  it("finds the plate by its id when a Far part sorts before it", () => {
    // Bug: taking the first layer as the plate judged the vista as the room and left the real plate unchecked, and called the plate floating.
    const vista = layer({ id: "chair", depth: 0.3, at: { x: 500, y: 500 } });
    const issues = checkWindow(room([vista, PLATE]), sizes, new Map<string, Side[]>([["plate", ["top", "bottom", "left", "right"]]]), window, { tilt: false });
    expect(issues).toEqual([]);
  });

  it("never calls the plate floating: it is cut on every side by nature", () => {
    const small = layer({ id: "plate", width: 400 });
    const issues = checkWindow(room([small]), new Map([["plate", { width: 400, height: 400 }]]), new Map<string, Side[]>([["plate", ["top", "right", "bottom", "left"]]]), window, { tilt: false });
    expect(issues.some((i) => i.kind === "floating")).toBe(false);
    expect(issues.some((i) => i.kind === "dark-edge")).toBe(true);
  });

  it("reports a dark edge in pixels when the drift outruns the plate, and more of it with tilt", () => {
    const flush = { x: 0, y: 200, w: 600, h: 600 };
    const scene = room([PLATE], 0.02);
    const plain = checkWindow(scene, sizes, new Map(), flush, { tilt: false });
    const tilted = checkWindow(scene, sizes, new Map(), flush, { tilt: true });
    if (plain[0]?.kind !== "dark-edge" || tilted[0]?.kind !== "dark-edge") throw new Error("expected a dark edge each");
    expect(tilted[0].px).toBeGreaterThan(plain[0].px);
  });

  it("names a layer whose image size it was not given, rather than skipping its check", () => {
    const chair = layer({ id: "chair", at: { x: 500, y: 600 } });
    expect(() => checkWindow(room([PLATE, chair]), new Map([["plate", { width: 1000, height: 1000 }]]), new Map<string, Side[]>([["chair", ["top"]]]), window, { tilt: false })).toThrow(/chair/);
  });
});

describe("windowFor", () => {
  const base = room([PLATE]);
  it("uses the scene's own window when it has one (fails if the authored window is ignored)", () => {
    const own = { x: 1, y: 2, w: 3, h: 4 };
    expect(windowFor({ ...base, windows: { tall: own } }, "tall")).toBe(own);
  });
  it("falls back per screen: a tall own window does not answer for wide", () => {
    const w = windowFor({ ...base, windows: { tall: { x: 1, y: 2, w: 3, h: 4 } } }, "wide");
    expect(w.w / w.h).toBeCloseTo(16 / 9);
  });
  it("centres the largest 16:9 in a square room, and the largest 9:19.5 too", () => {
    expect(windowFor(base, "wide")).toEqual({ x: 0, y: (1000 - 562.5) / 2, w: 1000, h: 562.5 });
    const tall = windowFor(base, "tall");
    expect(tall.h).toBeCloseTo(1000);
    expect(tall.w / tall.h).toBeCloseTo(9 / 19.5);
    expect(tall.x).toBeCloseTo((1000 - tall.w) / 2);
  });
  it("is limited by width in a room narrower than the aspect", () => {
    const narrow: Scene = { ...base, size: { width: 400, height: 1000 } };
    expect(windowFor(narrow, "wide")).toMatchObject({ x: 0, w: 400 });
  });
});
