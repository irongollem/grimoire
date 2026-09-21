import { describe, expect, it } from "vitest";
import { squashesOntoBand, stripBoundaryLightPixels, thresholdClearRect } from "./normalizeGeneratedTile";
import { WALL_BAND_PX, WALL_BAND_RATIO } from "./packSchema";

describe("stripBoundaryLightPixels", () => {
  it("removes boundary-connected white while preserving enclosed light detail", () => {
    const width = 5;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) pixels.set([255, 255, 255, 255], pixel * 4);
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) pixels.set([20, 30, 40, 255], (y * width + x) * 4);
    pixels.set([245, 245, 245, 255], (2 * width + 2) * 4);

    stripBoundaryLightPixels(pixels, width, height);

    expect(pixels[3]).toBe(0);
    expect(pixels[(2 * width + 2) * 4 + 3]).toBe(255);
  });
});

describe("squashesOntoBand", () => {
  it("squashes a wall and a shut door onto the gridline", () => {
    expect(squashesOntoBand("wallSegmentH", "centered-horizontal-edge")).toBe(true);
    expect(squashesOntoBand("wallSegmentV", "centered-vertical-edge")).toBe(true);
    expect(squashesOntoBand("doorClosedH", "centered-horizontal-edge")).toBe(true);
    expect(squashesOntoBand("doorClosedV", "centered-vertical-edge")).toBe(true);
  });

  /**
   * The regression. An open door is the one edge category whose art lives
   * partly OUTSIDE the band — an ajar leaf swings into the adjacent half-cell.
   * Squashing it onto the band flattens the leaf back onto the wall, and the
   * threshold clear then removes what survived, so the pipeline could only
   * ever emit "a wall with a hole in it" however well the tile was drawn.
   */
  it("never squashes an open door, despite its edge footprint", () => {
    expect(squashesOntoBand("doorOpenH", "centered-horizontal-edge")).toBe(false);
    expect(squashesOntoBand("doorOpenV", "centered-vertical-edge")).toBe(false);
  });

  it("leaves non-edge footprints alone", () => {
    expect(squashesOntoBand("floor", "full-cell")).toBe(false);
    expect(squashesOntoBand("rubble", "centered-overlay")).toBe(false);
    expect(squashesOntoBand("wallRoundJoint", "rounded-junction")).toBe(false);
  });
});

describe("thresholdClearRect", () => {
  it("cuts the doorway across the band only, never the full tile", () => {
    const rect = thresholdClearRect("doorOpenH", 128, 32)!;
    expect(rect.height).toBe(32);
    expect(rect.height).toBeLessThan(128);
    // Centred on the gridline: the band runs 48..80 of a 128px tile.
    expect(rect.y).toBe(48);
    expect(rect.y + rect.height).toBe(80);
  });

  it("mirrors the axes for a vertical door", () => {
    const rect = thresholdClearRect("doorOpenV", 128, 32)!;
    expect(rect.width).toBe(32);
    expect(rect.x).toBe(48);
    expect(rect.height).toBe(thresholdClearRect("doorOpenH", 128, 32)!.width);
  });

  it("keeps the opening inside the tile and centred on it", () => {
    for (const category of ["doorOpenH", "doorOpenV"] as const) {
      const rect = thresholdClearRect(category, 128, 32)!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(128);
      expect(rect.y + rect.height).toBeLessThanOrEqual(128);
      expect(rect.x + rect.width / 2).toBe(64);
      expect(rect.y + rect.height / 2).toBe(64);
    }
  });

  it("returns null for everything that is not an open door", () => {
    for (const category of ["floor", "wallSegmentH", "doorClosedH", "rubble", "stairsUp"] as const) {
      expect(thresholdClearRect(category)).toBeNull();
    }
  });

  it("tracks the band it is given, so it cannot drift from WALL_BAND_PX", () => {
    expect(thresholdClearRect("doorOpenH", 128, 20)!.height).toBe(20);
    expect(thresholdClearRect("doorOpenH", 128, 40)!.height).toBe(40);
  });
});

describe("WALL_BAND_PX", () => {
  it("is exactly a quarter of the base tile, and an integer at every zoom", () => {
    expect(WALL_BAND_PX).toBe(32);
    expect(WALL_BAND_RATIO).toBe(0.25);
    for (const tileSize of [128, 64, 32, 16]) {
      expect(Number.isInteger(tileSize * WALL_BAND_RATIO)).toBe(true);
    }
  });
});
