import { describe, expect, it } from "vitest";
import { squashesOntoBand, stripBoundaryLightPixels } from "./normalizeGeneratedTile";
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

describe("WALL_BAND_PX", () => {
  it("is exactly a quarter of the base tile, and an integer at every zoom", () => {
    expect(WALL_BAND_PX).toBe(32);
    expect(WALL_BAND_RATIO).toBe(0.25);
    for (const tileSize of [128, 64, 32, 16]) {
      expect(Number.isInteger(tileSize * WALL_BAND_RATIO)).toBe(true);
    }
  });
});
