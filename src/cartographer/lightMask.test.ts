import { describe, it, expect } from "vitest";
import { lightMask, MASK_SAMPLES_PER_CELL } from "./lightMask";
import { occluders } from "@/lib/battlemap/occlusion";
import type { OccluderInput } from "@/lib/battlemap/occlusion";

const S = MASK_SAMPLES_PER_CELL;
const EMPTY = occluders({ walls: [], doors: [], solid: [] });
/** The mask value at the sample holding the point (px, py), for a mask whose box starts at (x0, y0). */
const at = (m: ReturnType<typeof lightMask>, x0: number, y0: number, px: number, py: number): number =>
  m.alpha[Math.floor((py - y0) * S) * m.width + Math.floor((px - x0) * S)];

describe("lightMask", () => {
  it("is as wide as the cell box times the sample density", () => {
    const m = lightMask(EMPTY, 3, 3, 2, 0, 1, 6, 5);
    expect(m.width).toBe(6 * S);
    expect(m.height).toBe(4 * S);
    expect(m.alpha).toHaveLength(m.width * m.height);
  });

  it("sees everything inside the reach of an open square, and nothing outside it", () => {
    const m = lightMask(EMPTY, 3.5, 3.5, 2, 0, 0, 8, 8);
    expect(at(m, 0, 0, 3.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 4.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 3.5, 5.3)).toBe(255);
    expect(at(m, 0, 0, 7.5, 3.5)).toBe(0);
    expect(at(m, 0, 0, 6.5, 6.5)).toBe(0);
  });

  it("is cut by a wall on its far side", () => {
    // A wall down the x = 4 gridline.
    const occ = occluders({ walls: ["4,0:W", "4,1:W", "4,2:W", "4,3:W", "4,4:W", "4,5:W", "4,6:W"], doors: [], solid: [] });
    const m = lightMask(occ, 3.5, 3.5, 3, 0, 0, 8, 8);
    expect(at(m, 0, 0, 2.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 5.5, 3.5)).toBe(0);
  });

  it("lets a wedge through an open door but not a closed one", () => {
    const wall = (door: boolean): OccluderInput => ({
      walls: ["4,0:W", "4,1:W", "4,2:W", "4,4:W", "4,5:W", "4,6:W"],
      doors: [{ edge: "4,3:W", open: door }],
      solid: [],
    });
    const open = lightMask(occluders(wall(true)), 3.5, 3.5, 3, 0, 0, 8, 8);
    expect(at(open, 0, 0, 5.5, 3.5)).toBe(255);
    expect(at(open, 0, 0, 5.5, 0.6)).toBe(0);
    const shut = lightMask(occluders(wall(false)), 3.5, 3.5, 3, 0, 0, 8, 8);
    expect(at(shut, 0, 0, 5.5, 3.5)).toBe(0);
  });

  it("lights the faces of a wall it sits on, and nothing behind a second wall", () => {
    // The light is on the x = 4 gridline (a wall fitting's edge); another wall stands at x = 6.
    const col = (x: number) => [0, 1, 2, 3, 4, 5, 6].map((y) => `${x},${y}:W`);
    const m = lightMask(occluders({ walls: [...col(4), ...col(6)], doors: [], solid: [] }), 4, 3.5, 3, 0, 0, 8, 8);
    expect(at(m, 0, 0, 3.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 4.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 6.5, 3.5)).toBe(0);
  });
});
