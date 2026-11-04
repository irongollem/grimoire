import { describe, expect, it } from "vitest";
import { argbToHex, isUvttError, parseUniversalVtt, writeUniversalVtt } from "./universalVtt";

// 8-byte PNG signature, then padding: enough for the magic-byte sniff.
const PNG_B64 = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
const WEBP_B64 = btoa("RIFF\0\0\0\0WEBPVP8 ");

// Universal VTT spec: coordinates are grid units relative to map_origin.
const base = () => ({
  format: 0.3,
  resolution: { map_origin: { x: 1, y: 2 }, map_size: { x: 2, y: 2 }, pixels_per_grid: 100 },
  line_of_sight: [[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]],
  portals: [{ position: { x: 1, y: 0 }, bounds: [{ x: 1, y: 0 }, { x: 1, y: 1 }], rotation: 0, closed: true, freestanding: false }],
  lights: [{ position: { x: 1, y: 1 }, range: 4, intensity: 0.5, color: "ffeccd8b", shadows: true }],
  image: PNG_B64,
});

describe("parseUniversalVtt", () => {
  it("splits an L-shaped polyline into two segments shifted by map_origin", () => {
    const r = parseUniversalVtt(base());
    if (isUvttError(r)) throw new Error(r.error);
    expect(r.walls).toEqual([
      { a: [1, 2], b: [3, 2] },
      { a: [3, 2], b: [3, 3] },
    ]);
  });

  it("keeps objects_line_of_sight walls too", () => {
    const j = { ...base(), objects_line_of_sight: [[{ x: 0, y: 0 }, { x: 0, y: 1 }]] };
    const r = parseUniversalVtt(j);
    if (isUvttError(r)) throw new Error(r.error);
    expect(r.walls).toHaveLength(3);
  });

  it("reads a closed portal as a shut door and an open one as open", () => {
    const j = base();
    j.portals.push({ ...j.portals[0], closed: false });
    const r = parseUniversalVtt(j);
    if (isUvttError(r)) throw new Error(r.error);
    expect(r.doors.map((d) => d.open)).toEqual([false, true]);
    expect(r.doors[0]).toMatchObject({ a: [2, 2], b: [2, 3] });
  });

  it("turns an ARGB light colour into #rrggbb, dropping alpha", () => {
    const r = parseUniversalVtt(base());
    if (isUvttError(r)) throw new Error(r.error);
    expect(r.lights).toEqual([{ x: 2, y: 3, rangeCells: 4, intensity: 0.5, color: "#eccd8b" }]);
    expect(argbToHex("80ff0000")).toBe("#ff0000");
  });

  it("reads grid size and sniffs the image type from its bytes, not its name", () => {
    const png = parseUniversalVtt(base());
    const webp = parseUniversalVtt({ ...base(), image: WEBP_B64 });
    if (isUvttError(png) || isUvttError(webp)) throw new Error("unexpected error");
    expect([png.cols, png.rows, png.pixelsPerGrid]).toEqual([2, 2, 100]);
    expect(png.image.type).toBe("image/png");
    expect(webp.image.type).toBe("image/webp");
  });

  it("tolerates a file with no walls, portals or lights", () => {
    const { line_of_sight: _l, portals: _p, lights: _li, ...bare } = base();
    const r = parseUniversalVtt(bare);
    if (isUvttError(r)) throw new Error(r.error);
    expect([r.walls, r.doors, r.lights]).toEqual([[], [], []]);
  });

  it("reports an error for a file without a map size, a picture, or a real image", () => {
    expect(isUvttError(parseUniversalVtt("nope"))).toBe(true);
    expect(isUvttError(parseUniversalVtt({ ...base(), resolution: {} }))).toBe(true);
    expect(isUvttError(parseUniversalVtt({ ...base(), image: undefined }))).toBe(true);
    expect(isUvttError(parseUniversalVtt({ ...base(), image: btoa("not an image at all") }))).toBe(true);
    expect(isUvttError(parseUniversalVtt({ ...base(), image: "%%%not base64" }))).toBe(true);
    const zero = base();
    zero.resolution.pixels_per_grid = 0;
    expect(isUvttError(parseUniversalVtt(zero))).toBe(true);
  });
});

describe("writeUniversalVtt", () => {
  it("round-trips through the parser as a format 0.3 file", () => {
    const parsed = parseUniversalVtt(base());
    if (isUvttError(parsed)) throw new Error(parsed.error);
    const out = writeUniversalVtt({ imageBase64: PNG_B64, cols: 2, rows: 2, pixelsPerGrid: 100, walls: parsed.walls, doors: parsed.doors, lights: parsed.lights });
    expect(out.format).toBe(0.3);
    const again = parseUniversalVtt(out);
    if (isUvttError(again)) throw new Error(again.error);
    expect(again.walls).toEqual(parsed.walls);
    expect(again.doors).toEqual(parsed.doors);
    expect(again.lights).toEqual(parsed.lights);
  });
});
