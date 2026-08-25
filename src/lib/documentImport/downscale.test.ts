import { describe, it, expect } from "vitest";
import { targetDimensions, MAX_IMAGE_EDGE, DOWNSCALE_QUALITY } from "./downscale";

describe("targetDimensions", () => {
  it("leaves an image already inside the cap alone", () => {
    expect(targetDimensions(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it("never upscales — an image exactly at the cap is untouched", () => {
    expect(targetDimensions(MAX_IMAGE_EDGE, 400)).toEqual({ width: MAX_IMAGE_EDGE, height: 400 });
  });

  it("caps the long edge of a landscape photo and keeps the aspect ratio", () => {
    const { width, height } = targetDimensions(4032, 3024);
    expect(width).toBe(MAX_IMAGE_EDGE);
    expect(height).toBe(1200);
    expect(width / height).toBeCloseTo(4032 / 3024, 5);
  });

  it("caps the long edge of a portrait photo — the page orientation a DM actually shoots", () => {
    const { width, height } = targetDimensions(3024, 4032);
    expect(height).toBe(MAX_IMAGE_EDGE);
    expect(width).toBe(1200);
  });

  it("honours an explicit maxEdge", () => {
    expect(targetDimensions(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });

  // A panorama-shaped scan rounds its short edge below one pixel; a zero-height
  // canvas throws in the browser rather than producing a small image.
  it("never rounds an extreme aspect ratio down to a zero dimension", () => {
    const { width, height } = targetDimensions(40000, 3, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(1);
  });

  it("returns degenerate input unchanged rather than dividing by zero", () => {
    expect(targetDimensions(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("encoding constants", () => {
  // Guards against a well-meaning bump: the point of the re-encode is to make
  // the page caps fit inside MAX_UPLOAD_BYTES, and quality is the lever that
  // silently undoes it.
  it("keeps JPEG quality in the band where page text stays legible and small", () => {
    expect(DOWNSCALE_QUALITY).toBeGreaterThanOrEqual(0.75);
    expect(DOWNSCALE_QUALITY).toBeLessThanOrEqual(0.85);
  });
});
