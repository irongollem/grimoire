import { describe, expect, it } from "vitest";
import { TiledLayer } from "./tiledLayer";

describe("TiledLayer", () => {
  // Fails if tiles are allocated up front: a 4096 canvas would cost 64 MB before a stroke.
  it("allocates tiles only when asked", () => {
    const layer = new TiledLayer(1000, 600, 256);
    expect(layer.keys()).toEqual([]);
    layer.ensureTile(layer.key(1, 1));
    expect(layer.keys()).toEqual([layer.key(1, 1)]);
  });

  // Fails if setTile(null) leaves the entry behind, so erased areas keep costing memory.
  it("setTile(null) removes the tile", () => {
    const layer = new TiledLayer(300, 300, 256);
    layer.ensureTile(0);
    layer.setTile(0, null);
    expect(layer.tile(0)).toBeUndefined();
  });

  // Fails if the rect covers a tile the rectangle does not touch, or misses one across a seam.
  it("tilesInRect returns exactly the tiles a rectangle touches, clipped to the layer", () => {
    const layer = new TiledLayer(600, 600, 256);
    expect(layer.tilesInRect(250, 10, 10, 10).sort()).toEqual([layer.key(0, 0), layer.key(1, 0)].sort());
    expect(layer.tilesInRect(256, 256, 1, 1)).toEqual([layer.key(1, 1)]);
    expect(layer.tilesInRect(-50, -50, 40, 40)).toEqual([]);
    expect(layer.tilesInRect(590, 590, 500, 500)).toEqual([layer.key(2, 2)]);
  });

  // Fails if an edge tile's rect is reported at full size, so a renderer draws past the canvas.
  it("tileRect clips edge tiles to the layer", () => {
    const layer = new TiledLayer(300, 300, 256);
    expect(layer.tileRect(layer.key(1, 1))).toEqual({ x: 256, y: 256, w: 44, h: 44 });
  });

  // Fails if averageColour averages colour unweighted, so transparent black dilutes the paint colour.
  it("averageColour weights colour by alpha and reports mean alpha", () => {
    const layer = new TiledLayer(64, 64, 32);
    const t = layer.ensureTile(0);
    // Half the disc opaque red, half transparent black.
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const o = (y * 32 + x) * 4;
      if (x < 16) { t[o] = 200; t[o + 3] = 255; }
    }
    const avg = layer.averageColour(16, 16, 10);
    expect(avg).not.toBeNull();
    expect(avg?.r).toBeCloseTo(200, 0);
    expect(avg?.a).toBeGreaterThan(0.3);
    expect(avg?.a).toBeLessThan(0.7);
  });

  // Fails if empty pixels are reported as black paint instead of absence.
  it("averageColour is null over empty pixels", () => {
    expect(new TiledLayer(64, 64, 32).averageColour(10, 10, 5)).toBeNull();
  });

  // Fails if isTileEmpty only checks the first pixel.
  it("isTileEmpty sees a single painted pixel", () => {
    const layer = new TiledLayer(32, 32, 32);
    const t = layer.ensureTile(0);
    expect(layer.isTileEmpty(t)).toBe(true);
    t[(31 * 32 + 31) * 4 + 3] = 1;
    expect(layer.isTileEmpty(t)).toBe(false);
  });
});
