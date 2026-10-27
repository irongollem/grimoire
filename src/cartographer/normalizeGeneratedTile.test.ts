import { describe, expect, it } from "vitest";
import { decodeBase64, squashesOntoBand, stripBoundaryLightPixels } from "./normalizeGeneratedTile";
import { BASE_TILE_SIZE, WALL_BAND_PX, WALL_BAND_RATIO } from "./packSchema";

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

describe("stripBoundaryLightPixels: which pixels count as the background", () => {
  const DARK = [20, 30, 40, 255];
  /** A w x h image of dark pixels, with `paint` run over it. Returns the alpha of each pixel, row by row. */
  function strip(w: number, h: number, paint: (set: (x: number, y: number, rgba: number[]) => void) => void): number[][] {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) pixels.set(DARK, p * 4);
    paint((x, y, rgba) => pixels.set(rgba, (y * w + x) * 4));
    stripBoundaryLightPixels(pixels, w, h);
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => pixels[(y * w + x) * 4 + 3]!));
  }

  it("clears the pale pixel's way in from each side of the canvas and on, one cell at a time", () => {
    const WHITE = [250, 250, 250, 255];
    const alpha = strip(7, 7, (set) => {
      for (const [x, y] of [[3, 0], [3, 1], [3, 6], [3, 5], [0, 3], [1, 3], [6, 3], [5, 3]]) set(x, y, WHITE);
    });
    for (const [x, y] of [[3, 0], [3, 1], [3, 6], [3, 5], [0, 3], [1, 3], [6, 3], [5, 3]]) expect(alpha[y]![x], `${x},${y}`).toBe(0);
    expect(alpha[3]![3]).toBe(255);
  });

  it("follows a pale corridor round corners from the boundary", () => {
    const WHITE = [250, 250, 250, 255];
    const path = [[0, 2], [1, 2], [2, 2], [2, 3], [2, 4], [3, 4], [4, 4]];
    const alpha = strip(7, 7, (set) => path.forEach(([x, y]) => set(x!, y!, WHITE)));
    for (const [x, y] of path) expect(alpha[y!]![x!], `${x},${y}`).toBe(0);
  });

  it("is stopped by a dark pixel, so pale detail behind it survives", () => {
    const WHITE = [250, 250, 250, 255];
    const alpha = strip(7, 7, (set) => {
      set(3, 0, WHITE);
      set(3, 1, DARK);
      set(3, 2, WHITE);
    });
    expect(alpha[0]![3]).toBe(0);
    expect(alpha[2]![3]).toBe(255);
  });

  it("is stopped by an already transparent pixel", () => {
    const WHITE = [250, 250, 250, 255];
    const alpha = strip(7, 7, (set) => {
      set(3, 0, WHITE);
      set(3, 1, [250, 250, 250, 0]);
      set(3, 2, WHITE);
    });
    expect(alpha[2]![3]).toBe(255);
  });

  it.each([
    ["is pale at 210 on every channel", [210, 210, 210, 255], 0],
    ["is not pale one below 210", [209, 230, 230, 255], 255],
    ["is pale with the channels 24 apart", [255, 255, 231, 255], 0],
    ["is not pale with the channels 25 apart", [255, 255, 230, 255], 255],
  ])("a boundary pixel that %s", (_name, rgba, expected) => {
    expect(strip(5, 5, (set) => set(0, 0, rgba))[0]![0]).toBe(expected);
  });
});

describe("decodeBase64", () => {
  it("gives back the bytes, high ones included, and nothing more", () => {
    const decoded = decodeBase64(btoa(String.fromCharCode(0, 127, 128, 255)));
    expect(Array.from(decoded)).toEqual([0, 127, 128, 255]);
  });
});

describe("squashesOntoBand", () => {
  it("squashes a wall, doorway, grate and sluice onto the gridline", () => {
    expect(squashesOntoBand("wallSegmentH", "centered-horizontal-edge")).toBe(true);
    expect(squashesOntoBand("wallSegmentV", "centered-vertical-edge")).toBe(true);
    expect(squashesOntoBand("doorwayH", "centered-horizontal-edge")).toBe(true);
    expect(squashesOntoBand("doorwayV", "centered-vertical-edge")).toBe(true);
    expect(squashesOntoBand("edgeGrateH", "centered-horizontal-edge")).toBe(true);
    expect(squashesOntoBand("edgeSluiceV", "centered-vertical-edge")).toBe(true);
  });

  /**
   * The door leaf is drawn turned on its hinge, and a curb keeps its own,
   * thinner thickness: squashing either onto the wall band would undo that.
   */
  it("never squashes a door leaf or a curb, despite their edge footprint", () => {
    expect(squashesOntoBand("doorLeaf", "centered-horizontal-edge")).toBe(false);
    expect(squashesOntoBand("curbH", "centered-horizontal-edge")).toBe(false);
    expect(squashesOntoBand("curbV", "centered-vertical-edge")).toBe(false);
  });

  it("leaves non-edge footprints alone", () => {
    expect(squashesOntoBand("floor", "full-cell")).toBe(false);
    expect(squashesOntoBand("rubble", "centered-overlay")).toBe(false);
  });
});

describe("WALL_BAND_PX", () => {
  it("is the ratio of the base tile, and a whole number of pixels at every zoom", () => {
    expect(WALL_BAND_PX).toBe(BASE_TILE_SIZE * WALL_BAND_RATIO);
    for (const tileSize of [128, 64, 32, 16]) {
      expect(Number.isInteger(tileSize * WALL_BAND_RATIO)).toBe(true);
    }
  });
});
