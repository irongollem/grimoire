import { describe, it, expect } from "vitest";
import { areaOutline, decodeMask } from "./area";
import { applyDisc, coverage, emptyLegacy, encodeMask, type Legacy } from "@/test/legacyArea";
import type { PackRef } from "@/types/dungeonMap.types";

const REF: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };

function signedArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

describe("masks", () => {
  it("round-trips bits, full and empty", () => {
    const bits = new Uint8Array(64);
    bits[0] = 1;
    bits[33] = 1;
    bits[63] = 1;
    const enc = encodeMask(bits);
    expect(enc).toMatch(/^[0-9a-f]{16}$/);
    expect(Array.from(decodeMask(enc as string))).toEqual(Array.from(bits));
    expect(encodeMask(new Uint8Array(64).fill(1))).toBe("full");
    expect(encodeMask(new Uint8Array(64))).toBeNull();
    expect(coverage("full")).toBe(1);
    expect(coverage(enc as string)).toBeCloseTo(3 / 64);
  });

  it("puts bit 0 in the lowest hex digit", () => {
    const bits = new Uint8Array(64);
    bits[0] = 1;
    expect(encodeMask(bits)).toBe("0000000000000001");
  });
});

describe("areaOutline", () => {
  const disc = (l: Legacy, x: number, y: number, r: number, mode: "paint" | "erase" = "paint") =>
    applyDisc(l, { x, y, r }, REF, mode);

  it("returns no loops without area entries", () => {
    const l = emptyLegacy();
    l.floor["0,0"] = { floor: REF };
    expect(areaOutline(l).loops).toEqual([]);
  });

  it("traces one near-circular loop for a disc", () => {
    const l = disc(emptyLegacy(), 3, 3, 2);
    const { loops } = areaOutline(l);
    expect(loops).toHaveLength(1);
    for (const [x, y] of loops[0].points) {
      expect(Math.abs(Math.hypot(x - 3, y - 3) - 2)).toBeLessThan(0.15);
    }
    expect(loops[0].stroke.every(Boolean)).toBe(true);
    expect(loops[0].stroke).toHaveLength(loops[0].points.length);
  });

  it("gives a hole an opposite orientation to the outer loop", () => {
    const l = disc(disc(emptyLegacy(), 3, 3, 2.5), 3, 3, 1, "erase");
    const { loops } = areaOutline(l);
    expect(loops).toHaveLength(2);
    const [a, b] = loops.map((lp) => signedArea(lp.points)).sort((p, q) => Math.abs(q) - Math.abs(p));
    expect(Math.sign(a)).toBe(-1); // covered on the left, y down
    expect(Math.sign(b)).toBe(1);
  });

  it("merges overlapping discs into one loop", () => {
    const l = disc(disc(emptyLegacy(), 2, 2, 1.5), 3.5, 2, 1.5);
    expect(areaOutline(l).loops).toHaveLength(1);
  });

  it("does not stroke the stretch shared with plain floor", () => {
    const base = emptyLegacy();
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) base.floor[`${x},${y}`] = { floor: REF };
    const l = disc(base, 4, 1.5, 1.4);
    const { loops } = areaOutline(l);
    expect(loops).toHaveLength(1);
    expect(loops[0].stroke.some((s) => s)).toBe(true);
    expect(loops[0].stroke.some((s) => !s)).toBe(true);
    // Unstroked segments sit on the plain room's far edges (x <= 3).
    loops[0].points.forEach(([x], i) => {
      if (!loops[0].stroke[i]) expect(x).toBeLessThanOrEqual(3.01);
    });
  });

  it("outlines a 40 x 40 region quickly", () => {
    let l = emptyLegacy();
    for (let i = 0; i < 40; i += 3) for (let j = 0; j < 40; j += 3) l = disc(l, i + 1, j + 1, 2.4);
    const t = performance.now();
    const { loops } = areaOutline(l);
    const ms = performance.now() - t;
    expect(loops.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });
});
