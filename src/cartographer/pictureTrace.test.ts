// Walls found in the picture (#1197, frame 07): the outline of what is drawn, from flooding the page round it.
import { describe, expect, it } from "vitest";
import { DEFAULT_TRACE_OPTIONS, mapMask, proposeWallRings, type TracePixels } from "./pictureTrace";

type Rgb = [number, number, number];
const PAGE: Rgb = [52, 52, 54]; // a dark grey page
// Dull dark wood. Against the page (52, 52, 54) it is 5 brighter, 12 warmer (r - g) and 14 less cool (g - b): plain
// RGB distance squared is about 370, well inside the default limit of 40 squared, so only the hue weight tells it apart.
const TIMBER: Rgb = [70, 58, 46];
const FLOOR: Rgb = [200, 150, 80];

/** A picture `cells` squares wide and `rows` high at `px` pixels a square, painted by `colourAt(cellX, cellY)`. */
function picture(cells: number, rows: number, px: number, colourAt: (x: number, y: number) => Rgb): TracePixels {
  const width = cells * px;
  const height = rows * px;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const [r, g, b] = colourAt((i + 0.5) / px, (j + 0.5) / px);
      data.set([r, g, b, 255], (j * width + i) * 4);
    }
  }
  return { width, height, data };
}

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean => x >= x0 && x < x1 && y >= y0 && y < y1;
const bounds = (ring: readonly (readonly [number, number])[]) => ({
  minX: Math.min(...ring.map((p) => p[0])),
  maxX: Math.max(...ring.map((p) => p[0])),
  minY: Math.min(...ring.map((p) => p[1])),
  maxY: Math.max(...ring.map((p) => p[1])),
});
const AT_ORIGIN = { left: 0, top: 0, across: 12 };
const NO_INSET = { ...DEFAULT_TRACE_OPTIONS, inset: 0 };

describe("proposeWallRings", () => {
  // A 6 x 4 room at squares (3..9, 2..6) on a 12 x 8 page.
  const room = picture(12, 8, 8, (x, y) => (inBox(x, y, 3, 2, 9, 6) ? FLOOR : PAGE));

  it("proposes the outline of what is drawn on the page as one ring of four corners", () => {
    const rings = proposeWallRings(room, AT_ORIGIN, NO_INSET);
    expect(rings).toHaveLength(1);
    // With no inset and the grid snap on, the room's own corners.
    expect(rings[0].map(([x, y]) => `${x},${y}`).sort()).toEqual(["3,2", "3,6", "9,2", "9,6"]);
  });

  it("pulls the ring in by the inset, so the wall sits in the drawn wall and not on its outer face", () => {
    // 0.25 squares is two samples of the eight to a square; snap off so the pulled-in line is not pushed back out.
    const [ring] = proposeWallRings(room, AT_ORIGIN, { ...DEFAULT_TRACE_OPTIONS, inset: 0.25, snapToGrid: false });
    const b = bounds(ring);
    expect(b.minX).toBeCloseTo(3.25, 1);
    expect(b.maxX).toBeCloseTo(8.75, 1);
    expect(b.minY).toBeCloseTo(2.25, 1);
    expect(b.maxY).toBeCloseTo(5.75, 1);
  });

  it("places the ring on the map's grid where the picture lies, not at the picture's own corner", () => {
    // The same picture lined up with its top-left at square (10, -4).
    const [ring] = proposeWallRings(room, { left: 10, top: -4, across: 12 }, NO_INSET);
    expect(bounds(ring)).toEqual({ minX: 13, maxX: 19, minY: -2, maxY: 2 });
  });

  it("tells dark timber from a grey page of the same brightness by its hue", () => {
    // A timber frame one square thick round the floor: the outline is the frame's outer face, not the floor's edge.
    const framed = picture(12, 8, 8, (x, y) => (inBox(x, y, 3, 2, 9, 6) ? FLOOR : inBox(x, y, 2, 1, 10, 7) ? TIMBER : PAGE));
    const [ring] = proposeWallRings(framed, AT_ORIGIN, NO_INSET);
    expect(bounds(ring)).toEqual({ minX: 2, maxX: 10, minY: 1, maxY: 7 });
  });

  it("is not split by the page's own grid lines, which differ from the page in brightness only", () => {
    // Lighter grey lines on every square boundary of the page, one pixel wide.
    const lined = picture(12, 8, 8, (x, y) => {
      if (inBox(x, y, 3, 2, 9, 6)) return FLOOR;
      const onLine = x % 1 < 0.13 || y % 1 < 0.13;
      return onLine ? [78, 78, 80] : PAGE;
    });
    const rings = proposeWallRings(lined, AT_ORIGIN, NO_INSET);
    expect(rings).toHaveLength(1);
    expect(bounds(rings[0])).toEqual({ minX: 3, maxX: 9, minY: 2, maxY: 6 });
  });

  it("ignores a hair of ink running off the map, one sample wide", () => {
    // A bright line an eighth of a square thick from the room's right wall to near the picture's edge. Opened away,
    // the room keeps its four corners; left in, the outline would run out along the hair and back.
    const hair = picture(12, 8, 8, (x, y) => (inBox(x, y, 3, 2, 9, 6) || inBox(x, y, 9, 4, 11.5, 4.125) ? FLOOR : PAGE));
    const [ring] = proposeWallRings(hair, AT_ORIGIN, NO_INSET);
    expect(bounds(ring).maxX).toBe(9);
  });

  it("keeps a dark corner inside the map: the page can only come in from the picture's edge", () => {
    // A page-coloured pit in the middle of the floor is not reachable from the edge, so it cuts no hole.
    const pit = picture(12, 8, 8, (x, y) => (inBox(x, y, 5, 3, 7, 5) ? PAGE : inBox(x, y, 3, 2, 9, 6) ? FLOOR : PAGE));
    const rings = proposeWallRings(pit, AT_ORIGIN, NO_INSET);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });

  it("drops a speck smaller than two squares, such as a watermark", () => {
    const speck = picture(12, 8, 8, (x, y) => (inBox(x, y, 3, 2, 9, 6) || inBox(x, y, 10.5, 7, 11.5, 7.5) ? FLOOR : PAGE));
    expect(proposeWallRings(speck, AT_ORIGIN, NO_INSET)).toHaveLength(1);
  });

  it("proposes two buildings as two rings, the larger first", () => {
    // The small one sits top-left, where a scan meets it first: 2 x 2 = 4 squares, then 6 x 5 = 30.
    const two = picture(12, 8, 8, (x, y) => (inBox(x, y, 1, 1, 3, 3) || inBox(x, y, 5, 2, 11, 7) ? FLOOR : PAGE));
    const rings = proposeWallRings(two, AT_ORIGIN, NO_INSET);
    expect(rings.map((r) => bounds(r).minX)).toEqual([5, 1]);
  });

  it("leaves a round map round when the grid snap is off, and squares its edge points onto grid lines when it is on", () => {
    // A disc of radius 3 centred on (6, 4).
    const disc = picture(12, 8, 8, (x, y) => (Math.hypot(x - 6, y - 4) < 3 ? FLOOR : PAGE));
    const [free] = proposeWallRings(disc, AT_ORIGIN, { ...NO_INSET, snapToGrid: false });
    for (const [x, y] of free) expect(Math.abs(Math.hypot(x - 6, y - 4) - 3)).toBeLessThan(0.2);
    const [snapped] = proposeWallRings(disc, AT_ORIGIN, NO_INSET);
    // The disc's leftmost point (3, 4) is on a grid line; a point 0.2 inside it is pulled onto x = 3.
    expect(snapped.some(([x, y]) => Math.abs(Math.hypot(x - 6, y - 4) - 3) > 0.2)).toBe(true);
  });

  it("proposes nothing for a picture that fills its page edge to edge, or that is all page", () => {
    expect(proposeWallRings(picture(12, 8, 8, () => FLOOR), AT_ORIGIN, NO_INSET)).toEqual([]);
    expect(proposeWallRings(picture(12, 8, 8, () => PAGE), AT_ORIGIN, NO_INSET)).toEqual([]);
  });

  it("eats into a dim floor only when the tolerance is raised", () => {
    // A floor a little lighter and warmer than the page: map at the default tolerance, page at the loosest.
    const dim = picture(12, 8, 8, (x, y) => (inBox(x, y, 3, 2, 9, 6) ? [70, 62, 52] : PAGE));
    expect(proposeWallRings(dim, AT_ORIGIN, NO_INSET)).toHaveLength(1);
    expect(proposeWallRings(dim, AT_ORIGIN, { ...NO_INSET, tolerance: 1 })).toEqual([]);
  });
});

describe("mapMask", () => {
  it("counts everything outside the picture as page, so a map touching the picture's edge still closes", () => {
    // The floor runs to the picture's right edge; the ring still closes along that edge.
    const touching = picture(12, 8, 8, (x, y) => (inBox(x, y, 6, 2, 12, 6) ? FLOOR : PAGE));
    const { grid, field } = mapMask(touching, AT_ORIGIN, DEFAULT_TRACE_OPTIONS.tolerance);
    // The raster reaches a square past the picture on every side, and its outermost samples are page.
    expect(grid.ox).toBe(-1);
    expect(field[0]).toBe(0);
    const [ring] = proposeWallRings(touching, AT_ORIGIN, NO_INSET);
    expect(bounds(ring)).toEqual({ minX: 6, maxX: 12, minY: 2, maxY: 6 });
  });
});
