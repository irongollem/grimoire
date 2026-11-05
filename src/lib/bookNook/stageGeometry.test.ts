import { describe, expect, it } from "vitest";
import { addCutout, newScene, setAnchor } from "./edit.ts";
import { fitStage, hitLayer, imagePointAt, layerScreenRect, projectorFor, screenDeltaToRoom, widthFromCornerDrag } from "./stageGeometry.ts";
import { cameraAt, layersOf, parallax, screenFit, type Layer, type Point } from "./scene.ts";
import { windowFor } from "./framing.ts";

const scene0 = newScene({ id: "n", title: "N", room: { url: "r", width: 2400, height: 1350 } });
const scene = addCutout(scene0, { id: "chair", src: "c", width: 600, height: 900 }, { x: 1000, y: 900 });
const stage = { width: 800, height: 450 };
const view = { window: windowFor(scene, "wide"), breathe: 1 };
const chair = (): Layer => layersOf(scene).find((l) => l.id === "chair") as Layer;

describe("projector", () => {
  it("round-trips a room point through the stage at any depth and moment", () => {
    // Bug: an overlay or hit test that ignores parallax drifts off its layer as the camera moves.
    for (const t of [0, 3, 7.5]) {
      const p = projectorFor(scene, stage, view, t);
      for (const depth of [0.3, 1, 1.45]) {
        const room: Point = { x: 1234, y: 777 };
        const back = p.toRoom(p.toScreen(room, depth), depth);
        expect(back.x).toBeCloseTo(room.x, 6);
        expect(back.y).toBeCloseTo(room.y, 6);
      }
    }
  });

  it("agrees with what drawScene does: the window centre lands on the stage centre at depth 1 with no camera", () => {
    const still = { ...scene, camera: { drift: 0, push: 0 } };
    const p = projectorFor(still, stage, view, 0);
    const c = p.toScreen({ x: view.window.x + view.window.w / 2, y: view.window.y + view.window.h / 2 }, 1);
    expect(c.x).toBeCloseTo(400);
    expect(c.y).toBeCloseTo(225);
  });

  it("moves a nearer layer more than a farther one as the camera drifts (parallax is in the maths)", () => {
    const room: Point = { x: 1200, y: 675 };
    const shift = (depth: number) => {
      const a = projectorFor(scene, stage, view, 0).toScreen(room, depth);
      const b = projectorFor(scene, stage, view, 3).toScreen(room, depth);
      return Math.abs(a.x - b.x);
    };
    expect(shift(1.45)).toBeGreaterThan(shift(0.3));
    const fit = screenFit(scene, stage, view);
    const cam = cameraAt(scene, 3, view);
    expect(parallax(cam, 1).dx * fit.scale).not.toBe(0);
  });
});

describe("layers on the stage", () => {
  it("puts the chair's rectangle so its pin is at its anchor point", () => {
    const p = projectorFor(scene, stage, view, 0);
    const r = layerScreenRect(p, chair(), 1.5);
    const pin = p.toScreen(chair().at, chair().depth);
    expect(r.x + r.w * 0.5).toBeCloseTo(pin.x);
    expect(r.y + r.h).toBeCloseTo(pin.y);
  });

  it("reads the image point under the pointer, so dragging the pin sets an anchor without moving the picture", () => {
    const p = projectorFor(scene, stage, view, 0);
    const r = layerScreenRect(p, chair(), 1.5);
    const pt = imagePointAt(p, chair(), 1.5, { x: r.x + r.w * 0.25, y: r.y + r.h * 0.5 });
    expect(pt.x).toBeCloseTo(0.25);
    expect(pt.y).toBeCloseTo(0.5);
    const moved = layersOf(setAnchor(scene, "chair", pt, 1.5)).find((l) => l.id === "chair") as Layer;
    const r2 = layerScreenRect(p, moved, 1.5);
    expect(r2.x).toBeCloseTo(r.x);
    expect(r2.y).toBeCloseTo(r.y);
  });

  it("turns a drag in stage pixels into room pixels, more for a layer drawn smaller", () => {
    const p = projectorFor(scene, stage, view, 0);
    const d = screenDeltaToRoom(p, 1, 10, 0);
    expect(d.x * p.lengthScale(1)).toBeCloseTo(10);
  });
});

describe("hitLayer", () => {
  const aspects = new Map([["plate", 1350 / 2400], ["chair", 1.5]]);
  it("picks the topmost layer under the point, not the plate beneath it", () => {
    // Bug: picking the first match selects the plate every time, since it lies under everything.
    const p = projectorFor(scene, stage, view, 0);
    const r = layerScreenRect(p, chair(), 1.5);
    const hit = hitLayer(p, layersOf(scene), aspects, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    expect(hit?.id).toBe("chair");
  });

  it("falls to the plate where the chair is not, and to nothing outside the room", () => {
    const p = projectorFor(scene, stage, view, 0);
    expect(hitLayer(p, layersOf(scene), aspects, { x: 5, y: 5 })?.id).toBe("plate");
    expect(hitLayer(p, layersOf(scene), aspects, { x: -500, y: -500 })).toBeNull();
  });

  it("skips a layer whose image has not loaded", () => {
    const p = projectorFor(scene, stage, view, 0);
    const r = layerScreenRect(p, chair(), 1.5);
    expect(hitLayer(p, layersOf(scene), new Map([["plate", 0.5625]]), { x: r.x + r.w / 2, y: r.y + r.h / 2 })?.id).toBe("plate");
  });
});

describe("fitStage", () => {
  it("fits the aspect inside the space, limited by whichever side runs out first", () => {
    const wide = fitStage({ width: 1000, height: 300 }, 16 / 9);
    expect(wide.height).toBeCloseTo(300);
    expect(wide.width).toBeCloseTo((300 * 16) / 9);
    expect(fitStage({ width: 320, height: 900 }, 16 / 9)).toEqual({ width: 320, height: 180 });
    expect(fitStage({ width: 0, height: 10 }, 1)).toEqual({ width: 0, height: 0 });
  });
});

describe("widthFromCornerDrag", () => {
  // Bug: resizing pinned the opposite corner, so a standing cut-out's feet lifted off the table as it shrank.
  it("scales about the pin: halving the corner's distance from the pin halves the width", () => {
    expect(widthFromCornerDrag(200, { x: 100, y: 200 }, { x: 160, y: 120 }, { x: 130, y: 160 })).toBeCloseTo(100);
  });
  // Bug: a drag through the pin shrank a part to nothing, leaving nothing to grab.
  it("never goes below the minimum", () => {
    expect(widthFromCornerDrag(200, { x: 100, y: 200 }, { x: 160, y: 120 }, { x: 100, y: 200 })).toBe(16);
  });
});
