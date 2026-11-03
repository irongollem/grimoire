import { describe, expect, it } from "vitest";
import { pointInRing } from "@/lib/locations/polygon";
import type { MapLiveGroup } from "@/types/mapLive.types";
import { clipGroundMotion } from "./groundMotionClip";

type Point = [number, number];
const square = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const frame = { cellPx: 10, originX: 20, originY: 30, width: 100, height: 100 };

function mask() {
  let path: Point[][] = [];
  const clips: ((x: number, y: number) => boolean)[] = [];
  const ctx = {
    beginPath() { path = []; },
    moveTo(x: number, y: number) { path.push([[x, y]]); },
    lineTo(x: number, y: number) { path[path.length - 1].push([x, y]); },
    closePath() {},
    rect(x: number, y: number, w: number, h: number) { path.push(square(x, y, x + w, y + h)); },
    clip(rule?: CanvasFillRule) {
      const rings = path;
      clips.push((x, y) => {
        const hits = rings.filter((ring) => pointInRing(x, y, ring)).length;
        return rule === "evenodd" ? hits % 2 === 1 : hits > 0;
      });
    },
  };
  return { ctx, visible: (x: number, y: number) => clips.every((clip) => clip(x, y)) };
}

const water = (outline: Point[][], occluded: Point[][][] = []): MapLiveGroup => ({
  kind: "water", cells: ["99,99"], overlays: [], clip: { outline, occluded },
});

describe("ground motion clipping", () => {
  it("water follows a fractional shoreline instead of its cell-center projection", () => {
    // Editable-material-region direction: the animated shore matches the vector baked below it.
    const m = mask();
    clipGroundMotion(m.ctx, water([square(0.2, 0.2, 3.8, 3.8)]), frame);
    expect(m.visible(23, 33)).toBe(true);
    expect(m.visible(21, 31)).toBe(false);
    expect(m.visible(59, 69)).toBe(false);
  });

  it("an island cut out of water never receives the water animation", () => {
    const m = mask();
    clipGroundMotion(m.ctx, water([square(0, 0, 4, 4), square(1, 1, 2, 2)]), frame);
    expect(m.visible(25, 35)).toBe(true);
    expect(m.visible(35, 45)).toBe(false);
  });

  it("overlapping land covers hide water while a hole in a cover still exposes it", () => {
    const m = mask();
    clipGroundMotion(m.ctx, water([square(0, 0, 5, 5)], [
      [square(1, 1, 4, 4), square(2, 2, 3, 3)],
      [square(0.5, 0.5, 2, 2)],
    ]), frame);
    expect(m.visible(35, 45)).toBe(false); // Both covers overlap; they must not cancel.
    expect(m.visible(45, 55)).toBe(true); // Hole in the first cover, outside the second.
    expect(m.visible(55, 65)).toBe(false);
  });

  it("square outer-mass groups retain their own coverage through pan and scale", () => {
    const m = mask();
    clipGroundMotion(m.ctx, { kind: "outer", cells: ["1,2", "99,99"], overlays: [] }, frame);
    expect(m.visible(35, 55)).toBe(true);
    expect(m.visible(25, 45)).toBe(false);
    expect(m.visible(1015, 1025)).toBe(false);
  });
});
