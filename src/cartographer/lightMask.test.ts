import { describe, it, expect } from "vitest";
import { lightMask, MASK_SAMPLES_PER_CELL } from "./lightMask";
import { decodeMask } from "./area";
import { occluders } from "@/lib/battlemap/occlusion";
import type { OccluderInput } from "@/lib/battlemap/occlusion";

const ALL = (): boolean => true;
const S = MASK_SAMPLES_PER_CELL;
const EMPTY = occluders({ walls: [], doors: [], solid: [] });
/** The mask value at the sample holding the point (px, py), for a mask whose box starts at (x0, y0). */
const at = (m: ReturnType<typeof lightMask>, x0: number, y0: number, px: number, py: number): number =>
  m.alpha[Math.floor((py - y0) * S) * m.width + Math.floor((px - x0) * S)];

describe("lightMask", () => {
  it("is as wide as the cell box times the sample density", () => {
    const m = lightMask(EMPTY, 3, 3, 2, 0, 1, 6, 5, ALL);
    expect(m.width).toBe(6 * S);
    expect(m.height).toBe(4 * S);
    expect(m.alpha).toHaveLength(m.width * m.height);
  });

  it("sees everything inside the reach of an open square, and nothing outside it", () => {
    const m = lightMask(EMPTY, 3.5, 3.5, 2, 0, 0, 8, 8, ALL);
    expect(at(m, 0, 0, 3.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 4.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 3.5, 5.3)).toBe(255);
    expect(at(m, 0, 0, 7.5, 3.5)).toBe(0);
    expect(at(m, 0, 0, 6.5, 6.5)).toBe(0);
    // three cells away is past a reach of two, though still in the box
    expect(at(m, 0, 0, 3.5, 6.5)).toBe(0);
  });

  it("samples at cell centres: a light in the middle of the box shines the same to both sides", () => {
    const m = lightMask(EMPTY, 4, 4, 2, 0, 0, 8, 8, ALL);
    for (let j = 0; j < m.height; j++) {
      for (let i = 0; i < m.width; i++) {
        expect(m.alpha[j * m.width + i]).toBe(m.alpha[j * m.width + (m.width - 1 - i)]);
        expect(m.alpha[j * m.width + i]).toBe(m.alpha[(m.height - 1 - j) * m.width + i]);
      }
    }
  });

  it("is cut by a wall on its far side", () => {
    // A wall down the x = 4 gridline.
    const occ = occluders({ walls: ["4,0:W", "4,1:W", "4,2:W", "4,3:W", "4,4:W", "4,5:W", "4,6:W"], doors: [], solid: [] });
    const m = lightMask(occ, 3.5, 3.5, 3, 0, 0, 8, 8, ALL);
    expect(at(m, 0, 0, 2.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 5.5, 3.5)).toBe(0);
  });

  it("lets a wedge through an open door but not a closed one", () => {
    const wall = (door: boolean): OccluderInput => ({
      walls: ["4,0:W", "4,1:W", "4,2:W", "4,4:W", "4,5:W", "4,6:W"],
      doors: [{ edge: "4,3:W", open: door }],
      solid: [],
    });
    const open = lightMask(occluders(wall(true)), 3.5, 3.5, 3, 0, 0, 8, 8, ALL);
    expect(at(open, 0, 0, 5.5, 3.5)).toBe(255);
    expect(at(open, 0, 0, 5.5, 0.6)).toBe(0);
    const shut = lightMask(occluders(wall(false)), 3.5, 3.5, 3, 0, 0, 8, 8, ALL);
    expect(at(shut, 0, 0, 5.5, 3.5)).toBe(0);
  });

  it("lights the faces of a wall it sits on, and nothing behind a second wall", () => {
    // The light is on the x = 4 gridline (a wall fitting's edge); another wall stands at x = 6.
    const col = (x: number) => [0, 1, 2, 3, 4, 5, 6].map((y) => `${x},${y}:W`);
    const m = lightMask(occluders({ walls: [...col(4), ...col(6)], doors: [], solid: [] }), 4, 3.5, 3, 0, 0, 8, 8, ALL);
    expect(at(m, 0, 0, 3.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 4.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 6.5, 3.5)).toBe(0);
  });

  it("leaves samples off painted ground dark, brushed cells by their mask", () => {
    // Cell (3,3) is brushed on its left half only; everything else is empty space except cell (2,3), plain floor.
    const bits = new Uint8Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) bits[y * 8 + x] = 1;
    const lo = bits.slice(0, 32).reduceRight((a, b) => a * 2 + b, 0) >>> 0;
    const hi = bits.slice(32).reduceRight((a, b) => a * 2 + b, 0) >>> 0;
    const mask = hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
    const decoded = decodeMask(mask);
    const ground = (x: number, y: number): boolean => {
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (cx === 3 && cy === 3) return decoded[Math.floor((y - cy) * 8) * 8 + Math.floor((x - cx) * 8)] === 1;
      return cx === 2 && cy === 3;
    };
    const m = lightMask(EMPTY, 3.5, 3.5, 3, 0, 0, 8, 8, ground);
    expect(at(m, 0, 0, 3.1, 3.5)).toBe(255);
    expect(at(m, 0, 0, 3.9, 3.5)).toBe(0);
    expect(at(m, 0, 0, 2.5, 3.5)).toBe(255);
    expect(at(m, 0, 0, 5.5, 3.5)).toBe(0);
  });
});
