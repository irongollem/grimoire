import { describe, expect, it } from "vitest";
import { lassoRing, regionLoops, ringArea, strokeZoneRing } from "./zoneBrush";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";

describe("ringArea", () => {
  it("measures a ring the same whichever way round it runs", () => {
    // Reasoned: a 4 by 3 rectangle is 12; the right triangle with legs 4 and 3 is 6.
    const rect: GridPoint[] = [[0, 0], [4, 0], [4, 3], [0, 3]];
    expect(ringArea(rect)).toBe(12);
    expect(ringArea([...rect].reverse())).toBe(12);
    expect(ringArea([[0, 0], [4, 0], [0, 3]])).toBe(6);
  });
});

describe("regionLoops", () => {
  const nine = ["5,5", "6,5", "7,5", "5,6", "6,6", "7,6", "5,7", "6,7", "7,7"] as CellKey[];

  it("traces a zone painted as squares into one outline on the squares' own edges", () => {
    const loops = regionLoops(null, nine);
    expect(loops).toHaveLength(1);
    // Reasoned: nine squares in a 3 by 3 block enclose 9; the contour may shave the corners by a sample or two,
    // never add area and never lose half a square.
    expect(ringArea(loops[0])).toBeGreaterThan(8.5);
    expect(ringArea(loops[0])).toBeLessThanOrEqual(9.0001);
  });

  it("takes the ring when there is one, whatever squares the row also lists", () => {
    const ring: GridPoint[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(regionLoops(ring, nine)).toEqual([ring]);
  });

  it("has no loops for a region with neither", () => {
    expect(regionLoops(null, [])).toEqual([]);
  });
});

describe("lassoRing", () => {
  it("needs three distinct points: repeats of two points make no shape", () => {
    expect(lassoRing([[0, 0], [5, 5], [0, 0], [5, 5]])).toBeNull();
  });
});

describe("strokeZoneRing", () => {
  it("returns the larger of two blobs when a stroke lands away from the zone", () => {
    const small: GridPoint[] = [[0, 0], [2, 0], [2, 2], [0, 2]]; // area 4
    // A disc of radius 3 centred at (20,20) is about 28 square and is the bigger blob.
    const ring = strokeZoneRing([small], [{ x: 20, y: 20, r: 3 }], false);
    expect(ring).not.toBeNull();
    expect(Math.min(...ring!.map((p) => p[0]))).toBeGreaterThan(16);
  });
});
