import { describe, it, expect } from "vitest";
import { applyDisc, applyDiscs, areaBlockingEdges, areaOutline, coverage, decodeMask, encodeMask, FLOOR_COVERAGE } from "./area";
import { emptyLayers, type DungeonMapLayers, type PackRef } from "@/types/dungeonMap.types";

const REF: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };
const OTHER: PackRef = { pack_id: "q", pack_version: 1, variant: 2 };

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

describe("applyDisc", () => {
  it("paints a partial cell without floor and a mostly covered one with floor", () => {
    const small = applyDisc(emptyLayers(), { x: 0.1, y: 0.1, r: 0.3 }, REF, "paint");
    expect(small.area["0,0"]).toBeDefined();
    expect(coverage(small.area["0,0"].mask)).toBeLessThan(FLOOR_COVERAGE);
    expect(small.floor["0,0"]).toBeUndefined();

    const big = applyDisc(emptyLayers(), { x: 0.5, y: 0.5, r: 0.7 }, REF, "paint");
    expect(big.area["0,0"].mask).toBe("full");
    expect(big.floor["0,0"]?.floor).toMatchObject(REF);
  });

  it("leaves plain floor alone when painting and keeps untouched identities", () => {
    const base = emptyLayers();
    base.floor["0,0"] = { floor: REF };
    base.area["5,5"] = { ...REF, mask: "full" };
    const out = applyDisc(base, { x: 0.5, y: 0.5, r: 0.4 }, OTHER, "paint");
    expect(out).toBe(base);
    const out2 = applyDisc(base, { x: 2.5, y: 0.5, r: 0.4 }, OTHER, "paint");
    expect(out2.area["5,5"]).toBe(base.area["5,5"]);
    expect(out2.floor["0,0"]).toBe(base.floor["0,0"]);
    expect(base.area["2,0"]).toBeUndefined();
  });

  it("returns the layers untouched when a repaint changes nothing, and writes when only the variant or turn differs", () => {
    const painted = applyDisc(emptyLayers(), { x: 0.5, y: 0.5, r: 0.7 }, REF, "paint");
    expect(applyDisc(painted, { x: 0.5, y: 0.5, r: 0.3 }, REF, "paint")).toBe(painted);
    for (const other of [{ ...REF, variant: 1 }, { ...REF, rotation: 90 }, { ...REF, pack_version: 2 }]) {
      expect(applyDisc(painted, { x: 0.5, y: 0.5, r: 0.3 }, other, "paint")).not.toBe(painted);
    }
  });

  it("keeps a cell's floor at exactly half coverage and drops it below", () => {
    // A disc of radius 30 centred 30 cells above cell (0,0) is, across one cell, a straight edge along y = 0.5:
    // erasing it from plain floor leaves the bottom four of the cell's eight sub-rows, exactly half.
    const base = emptyLayers();
    base.floor["0,0"] = { floor: REF };
    const half = applyDisc(base, { x: 0.5, y: 0.5 - 30, r: 30 }, REF, "erase");
    expect(coverage(half.area["0,0"].mask)).toBe(FLOOR_COVERAGE);
    expect(half.floor["0,0"]?.floor).toBeDefined();
    const less = applyDisc(base, { x: 0.5, y: 0.75 - 30, r: 30 }, REF, "erase");
    expect(coverage(less.area["0,0"].mask)).toBeLessThan(FLOOR_COVERAGE);
    expect(less.floor["0,0"]).toBeUndefined();
  });

  it("takes the latest pack on repaint", () => {
    let l = applyDisc(emptyLayers(), { x: 0.5, y: 0.5, r: 0.7 }, REF, "paint");
    l = applyDisc(l, { x: 0.5, y: 0.5, r: 0.2 }, OTHER, "paint");
    expect(l.area["0,0"].pack_id).toBe("q");
    expect(l.floor["0,0"]?.floor?.pack_id).toBe("q");
  });

  it("erasing empties a mask and removes the entry and floor, keeping walls", () => {
    let l = applyDisc(emptyLayers(), { x: 0.5, y: 0.5, r: 0.7 }, REF, "paint");
    l.floor["0,0"] = { ...l.floor["0,0"], wallN: { ...REF, type: "wall" } };
    l = applyDisc(l, { x: 0.5, y: 0.5, r: 1 }, REF, "erase");
    expect(l.area["0,0"]).toBeUndefined();
    expect(l.floor["0,0"]).toEqual({ wallN: { ...REF, type: "wall" } });
    const clean = applyDisc(applyDisc(emptyLayers(), { x: 0.5, y: 0.5, r: 0.7 }, REF, "paint"), { x: 0.5, y: 0.5, r: 1 }, REF, "erase");
    expect(clean.floor["0,0"]).toBeUndefined();
  });

  it("erasing plain floor carves an area cell, and enough carving drops the floor", () => {
    const base = emptyLayers();
    base.floor["0,0"] = { floor: REF };
    const carved = applyDisc(base, { x: 0, y: 0, r: 0.4 }, REF, "erase");
    expect(carved.area["0,0"]).toBeDefined();
    expect(carved.area["0,0"].mask).not.toBe("full");
    expect(carved.floor["0,0"]?.floor).toBeDefined();
    const more = applyDisc(carved, { x: 0.5, y: 0.5, r: 0.45 }, REF, "erase");
    expect(coverage(more.area["0,0"].mask)).toBeLessThan(FLOOR_COVERAGE);
    expect(more.floor["0,0"]).toBeUndefined();
  });

  it("erasing plain floor the disc wholly covers removes it, keeping walls", () => {
    const base = emptyLayers();
    base.floor["0,0"] = { floor: REF, wallN: { ...REF, type: "wall" } };
    base.floor["1,0"] = { floor: REF };
    const out = applyDisc(base, { x: 1, y: 0.5, r: 1.5 }, REF, "erase");
    expect(out.floor["0,0"]).toEqual({ wallN: { ...REF, type: "wall" } });
    expect(out.floor["1,0"]).toBeUndefined();
    expect(out.area["0,0"]).toBeUndefined();
    expect(out.area["1,0"]).toBeUndefined();
  });
});

describe("applyDiscs", () => {
  it("is the discs applied one by one, from a single copy of the records", () => {
    const discs = [
      { x: 0.5, y: 0.5, r: 0.6 },
      { x: 1.2, y: 0.6, r: 0.6 },
      { x: 2, y: 0.8, r: 0.6 },
    ];
    const oneByOne = discs.reduce((l, d) => applyDisc(l, d, REF, "paint"), emptyLayers());
    expect(applyDiscs(emptyLayers(), discs, REF, "paint")).toEqual(oneByOne);
  });

  it("returns the input when no disc changed anything", () => {
    const base = emptyLayers();
    expect(applyDiscs(base, [{ x: 0.5, y: 0.5, r: 1 }], REF, "erase")).toBe(base);
  });
});

describe("areaOutline", () => {
  const disc = (l: DungeonMapLayers, x: number, y: number, r: number, mode: "paint" | "erase" = "paint") =>
    applyDisc(l, { x, y, r }, REF, mode);

  it("returns no loops without area entries", () => {
    const l = emptyLayers();
    l.floor["0,0"] = { floor: REF };
    expect(areaOutline(l).loops).toEqual([]);
  });

  it("traces one near-circular loop for a disc", () => {
    const l = disc(emptyLayers(), 3, 3, 2);
    const { loops } = areaOutline(l);
    expect(loops).toHaveLength(1);
    for (const [x, y] of loops[0].points) {
      expect(Math.abs(Math.hypot(x - 3, y - 3) - 2)).toBeLessThan(0.15);
    }
    expect(loops[0].stroke.every(Boolean)).toBe(true);
    expect(loops[0].stroke).toHaveLength(loops[0].points.length);
  });

  it("gives a hole an opposite orientation to the outer loop", () => {
    const l = disc(disc(emptyLayers(), 3, 3, 2.5), 3, 3, 1, "erase");
    const { loops } = areaOutline(l);
    expect(loops).toHaveLength(2);
    const [a, b] = loops.map((lp) => signedArea(lp.points)).sort((p, q) => Math.abs(q) - Math.abs(p));
    expect(Math.sign(a)).toBe(-1); // covered on the left, y down
    expect(Math.sign(b)).toBe(1);
  });

  it("merges overlapping discs into one loop", () => {
    const l = disc(disc(emptyLayers(), 2, 2, 1.5), 3.5, 2, 1.5);
    expect(areaOutline(l).loops).toHaveLength(1);
  });

  it("does not stroke the stretch shared with plain floor", () => {
    const base = emptyLayers();
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
    let l = emptyLayers();
    for (let i = 0; i < 40; i += 3) for (let j = 0; j < 40; j += 3) l = disc(l, i + 1, j + 1, 2.4);
    const t = performance.now();
    const { loops } = areaOutline(l);
    const ms = performance.now() - t;
    expect(loops.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });
});

describe("areaBlockingEdges", () => {
  it("lists NW-owned edges between floor and non-floor where an area is involved", () => {
    const l = applyDisc(emptyLayers(), { x: 0.5, y: 0.5, r: 0.7 }, REF, "paint");
    expect(areaBlockingEdges(l)).toEqual(["0,0:N", "0,0:W", "0,1:N", "1,0:W"]);
  });

  it("ignores the drawn map's own plain floor edges", () => {
    const l = emptyLayers();
    l.floor["0,0"] = { floor: REF };
    expect(areaBlockingEdges(l)).toEqual([]);
  });

  it("includes the edge between plain floor and a neighbouring area cell, once", () => {
    const l = emptyLayers();
    l.floor["0,0"] = { floor: REF };
    l.area["1,0"] = { ...REF, mask: "full" };
    l.floor["1,0"] = { floor: REF };
    expect(areaBlockingEdges(l)).not.toContain("1,0:W");
    expect(areaBlockingEdges(l)).toContain("1,0:N");
  });
});
