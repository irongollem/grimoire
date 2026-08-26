import { describe, expect, it } from "vitest";
import { stripBoundaryLightPixels } from "./normalizeGeneratedTile";

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
