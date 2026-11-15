import { describe, expect, it } from "vitest";
import { lassoRing, regionLoops, strokeZoneShape } from "./zoneBrush";
import { ringArea } from "./polygon";
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

describe("strokeZoneShape", () => {
  const square: GridPoint[] = [[0, 0], [4, 0], [4, 4], [0, 4]]; // 16 squares

  it("grows a zone into one smooth ring when the stroke touches it", () => {
    const shape = strokeZoneShape([square], [{ x: 4, y: 2, r: 1.5 }], false)!;
    expect("ring" in shape).toBe(true);
    // Reasoned: the disc (area about 7) lies half inside the square, so the union is 16 plus about 3.5.
    const area = ringArea((shape as { ring: GridPoint[] }).ring);
    expect(area).toBeGreaterThan(18);
    expect(area).toBeLessThan(21);
  });

  it("keeps the zone when a stroke lands away from it: both parts stay, as squares", () => {
    // Before this, only the larger blob was kept, so one dab with a big brush deleted the zone it was meant to add to.
    const shape = strokeZoneShape([square], [{ x: 20.5, y: 20.5, r: 3 }], false)!;
    expect("cells" in shape).toBe(true);
    const cells = (shape as { cells: CellKey[] }).cells;
    expect(cells).toContain("0,0");
    expect(cells).toContain("3,3");
    expect(cells).toContain("20,20");
    expect(cells).not.toContain("10,10");
  });

  it("keeps both halves of a zone a carve cuts in two", () => {
    const long: GridPoint[] = [[0, 0], [12, 0], [12, 2], [0, 2]];
    const cut = Array.from({ length: 9 }, (_, i) => ({ x: 6, y: -1 + i * 0.5, r: 1 }));
    const shape = strokeZoneShape([long], cut, true)!;
    const cells = (shape as { cells: CellKey[] }).cells;
    expect(cells).toContain("0,0");
    expect(cells).toContain("11,1");
    expect(cells).not.toContain("5,0");
    expect(cells).not.toContain("6,1");
  });

  it("keeps a hole in a zone painted as squares when a stroke touches its far side", () => {
    // A 5 by 5 block of squares with the middle one left out (a pillar), then a dab on its corner.
    const squares: CellKey[] = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (!(x === 2 && y === 2)) squares.push(`${x},${y}` as CellKey);
    const shape = strokeZoneShape(regionLoops(null, squares), [{ x: 5, y: 5, r: 1.2 }], false)!;
    const cells = (shape as { cells: CellKey[] }).cells;
    expect(cells).not.toContain("2,2");
    expect(cells).toContain("0,0");
    expect(cells).toContain("4,4");
  });

  it("makes nothing of a dab smaller than a square where there was no zone, rather than an empty write", () => {
    // Radius 0.5 covers 0.79 of a square. `null` tells the caller to write nothing and file no undo step.
    expect(strokeZoneShape([], [{ x: 3.5, y: 3.5, r: 0.5 }], false)).toBeNull();
  });

  it("says nothing is left when a carve takes the whole zone", () => {
    const small: GridPoint[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(strokeZoneShape([small], [{ x: 1, y: 1, r: 3 }], true)).toEqual({ cells: [] });
  });
});
