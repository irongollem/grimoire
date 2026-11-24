import { crc32 as nodeCrc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isValidGeminiAspectRatio } from "./geminiAspect.ts";
import { isValidStyleImageSize, readPngDimensions } from "./imageSize.ts";
import { BACKGROUND, DOOR, FLOOR, planPicturePng, type PlanPictureInput, WALL, planCanvas } from "./planPicture.ts";

/** Reads the PNG back with node's own inflate, so the test shares no code with the encoder. */
function decode(png: Uint8Array) {
  const buf = Buffer.from(png);
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(buf[24]).toBe(8);
  expect(buf[25]).toBe(2);
  const idatLen = buf.readUInt32BE(33);
  expect(buf.subarray(37, 41).toString()).toBe("IDAT");
  const raw = inflateSync(buf.subarray(41, 41 + idatLen));
  const stride = 1 + width * 3;
  expect(raw.length).toBe(stride * height);
  expect(buf.subarray(buf.length - 8, buf.length - 4).toString()).toBe("IEND");
  return {
    width,
    height,
    pixel(x: number, y: number) {
      const i = y * stride + 1 + x * 3;
      return [raw[i], raw[i + 1], raw[i + 2]];
    },
    filterBytes: Array.from({ length: height }, (_, y) => raw[y * stride]),
  };
}

const plan: PlanPictureInput = {
  cols: 10,
  rows: 6,
  rooms: [{ x: 1, y: 1, w: 3, h: 3 }],
  walls: [
    { a: [1, 1], b: [4, 1] },
    { a: [4, 1], b: [4, 2] },
    { a: [4, 3], b: [4, 4] },
  ],
  doors: [{ a: [4, 2], b: [4, 3] }],
};

describe("planPicturePng pixels", () => {
  it("paints floor in a room, background outside, a wall on its midpoint, a door (not wall) in the gap", async () => {
    const out = await planPicturePng(plan);
    const img = decode(out.png);
    const c = out.pxPerCell;
    expect(img.pixel(Math.round(2.5 * c), Math.round(2.5 * c))).toEqual([...FLOOR]);
    expect(img.pixel(Math.round(8.5 * c), Math.round(5.5 * c))).toEqual([...BACKGROUND]);
    expect(img.pixel(Math.round(4 * c), Math.round(1.5 * c))).toEqual([...WALL]);
    expect(img.pixel(Math.round(4 * c), Math.round(2.5 * c))).toEqual([...DOOR]);
  });

  it("draws a door over a wall that runs through the same gap", async () => {
    const out = await planPicturePng({ ...plan, walls: [{ a: [4, 1], b: [4, 4] }] });
    expect(decode(out.png).pixel(Math.round(4 * out.pxPerCell), Math.round(2.5 * out.pxPerCell))).toEqual([...DOOR]);
  });

  it("joins wall corners so the outer corner pixel is solid", async () => {
    const out = await planPicturePng({
      ...plan,
      walls: [
        { a: [1, 1], b: [4, 1] },
        { a: [1, 1], b: [1, 4] },
      ],
    });
    const c = out.pxPerCell;
    // One pixel up-left of the lattice point (1,1), where neither segment alone reaches.
    expect(decode(out.png).pixel(c - 1, c - 1)).toEqual([...WALL]);
  });

  it("joins wall corners on the far side too", async () => {
    const out = await planPicturePng({
      ...plan,
      walls: [
        { a: [1, 4], b: [4, 4] },
        { a: [4, 1], b: [4, 4] },
      ],
    });
    const c = out.pxPerCell;
    const half = Math.max(2, Math.round(c / 6)) - Math.floor(Math.max(2, Math.round(c / 6)) / 2);
    // Just past lattice point (4,4) on both axes, covered only by each wall's far-end extension.
    expect(decode(out.png).pixel(4 * c + half - 1, 4 * c + half - 1)).toEqual([...WALL]);
  });

  it("writes filter type 0 on every scanline", async () => {
    const { filterBytes } = decode((await planPicturePng(plan)).png);
    expect(new Set(filterBytes)).toEqual(new Set([0]));
  });
});

describe("planPicturePng size", () => {
  const shapes: Array<[string, number, number]> = [
    ["wide", 60, 12],
    ["tall", 12, 60],
    ["square", 30, 30],
    ["tiny", 4, 4],
    ["very wide strip", 80, 3],
  ];
  it.each(shapes)("a %s plan lands on a size and aspect the styler accepts, with the grid inside", async (_n, cols, rows) => {
    const out = await planPicturePng({ cols, rows, rooms: [{ x: 0, y: 0, w: cols, h: rows }], walls: [], doors: [] });
    const dims = readPngDimensions(out.png);
    expect(dims).toEqual({ width: out.width, height: out.height });
    expect(isValidStyleImageSize(out.width, out.height)).toBe(true);
    expect(isValidGeminiAspectRatio(out.width, out.height)).toBe(true);
    expect(Math.max(out.width, out.height)).toBeGreaterThanOrEqual(768);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2048);
    expect(out.padRight).toBe(out.width - cols * out.pxPerCell);
    expect(out.padBottom).toBe(out.height - rows * out.pxPerCell);
    expect(out.padRight).toBeGreaterThanOrEqual(0);
    expect(out.padBottom).toBeGreaterThanOrEqual(0);
  });

  // The size alone, without encoding a picture per grid (encoding ~8,000 of them timed out under the full suite).
  it("every grid from 1 to 90 cells a side finds a size the styler accepts, holding the whole grid", () => {
    for (let cols = 1; cols <= 90; cols++) {
      for (let rows = 1; rows <= 90; rows++) {
        const c = planCanvas(cols, rows);
        expect(isValidStyleImageSize(c.width, c.height), `${cols}x${rows}`).toBe(true);
        expect(isValidGeminiAspectRatio(c.width, c.height), `${cols}x${rows}`).toBe(true);
        expect(c.width >= cols * c.pxPerCell && c.height >= rows * c.pxPerCell, `${cols}x${rows}`).toBe(true);
      }
    }
  });

  it("leaves padding as background, not floor", async () => {
    const out = await planPicturePng({ cols: 80, rows: 3, rooms: [{ x: 0, y: 0, w: 80, h: 3 }], walls: [], doors: [] });
    expect(out.padBottom).toBeGreaterThan(0);
    expect(decode(out.png).pixel(5, out.height - 1)).toEqual([...BACKGROUND]);
  });

  it.each([[0, 5], [5, 0], [2.5, 4]])("refuses a plan of %s by %s cells", async (cols, rows) => {
    await expect(planPicturePng({ cols, rows, rooms: [], walls: [], doors: [] })).rejects.toThrow();
  });
});

describe("planPicturePng chunks", () => {
  it("IHDR's CRC matches an independent computation", async () => {
    const buf = Buffer.from((await planPicturePng(plan)).png);
    expect(buf.readUInt32BE(29)).toBe(nodeCrc32(buf.subarray(12, 29)));
  });
});
