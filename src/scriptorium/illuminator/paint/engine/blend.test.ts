import { describe, expect, it } from "vitest";
import { blendPixel } from "./blend";

const px = (r: number, g: number, b: number, a: number) => new Uint8ClampedArray([r, g, b, a]);

describe("blendPixel", () => {
  // Fails if coverage is ignored for normal: half coverage must give half alpha on empty.
  it("normal at half coverage onto empty gives half alpha and the source colour", () => {
    const d = px(0, 0, 0, 0);
    blendPixel(d, 0, "normal", 200, 100, 50, 0.5);
    expect([d[0], d[1], d[2]]).toEqual([200, 100, 50]);
    expect(d[3]).toBe(128);
  });

  // Fails if clear touches colour or ignores coverage; erase lowers alpha by coverage.
  it("clear lowers alpha by coverage", () => {
    const d = px(10, 20, 30, 200);
    blendPixel(d, 0, "clear", 0, 0, 0, 0.5);
    expect(d[3]).toBe(100);
    expect([d[0], d[1], d[2]]).toEqual([10, 20, 30]);
  });

  // Fails if behind paints over opaque pixels (it would be plain normal).
  it("behind leaves opaque pixels unchanged", () => {
    const d = px(10, 20, 30, 255);
    blendPixel(d, 0, "behind", 250, 250, 250, 1);
    expect(Array.from(d)).toEqual([10, 20, 30, 255]);
  });

  // Fails if behind does not fill empty pixels.
  it("behind fills transparent pixels", () => {
    const d = px(0, 0, 0, 0);
    blendPixel(d, 0, "behind", 250, 100, 10, 1);
    expect(Array.from(d)).toEqual([250, 100, 10, 255]);
  });

  // Fails if behind shows through a half-opaque pixel at full strength instead of only in the gap.
  it("behind on a half-opaque pixel keeps the pixel's colour dominant", () => {
    const d = px(0, 0, 0, 128);
    blendPixel(d, 0, "behind", 255, 255, 255, 1);
    expect(d[3]).toBe(255);
    expect(d[0]).toBeLessThan(130);
  });

  // Fails if multiply is implemented as screen or averaging: it must never lighten.
  it("multiply never lightens", () => {
    for (const [cb, cs] of [[200, 100], [50, 250], [255, 30], [90, 90]]) {
      const d = px(cb, cb, cb, 255);
      blendPixel(d, 0, "multiply", cs, cs, cs, 1);
      expect(d[0]).toBeLessThanOrEqual(cb);
    }
  });

  // Fails if screen darkens.
  it("screen never darkens", () => {
    const d = px(100, 100, 100, 255);
    blendPixel(d, 0, "screen", 60, 60, 60, 1);
    expect(d[0]).toBeGreaterThanOrEqual(100);
  });

  // Fails if overlay does not branch on the backdrop (dark backdrop must darken, light must lighten).
  it("overlay multiplies on dark backdrops and screens on light ones", () => {
    const dark = px(60, 60, 60, 255);
    blendPixel(dark, 0, "overlay", 100, 100, 100, 1);
    expect(dark[0]).toBeLessThan(60);
    const light = px(200, 200, 200, 255);
    blendPixel(light, 0, "overlay", 150, 150, 150, 1);
    expect(light[0]).toBeGreaterThan(200);
  });

  // Fails if soft-light uses the wrong half of the formula: a light source must lighten a mid backdrop.
  it("soft-light lightens with a light source and darkens with a dark one", () => {
    const a = px(128, 128, 128, 255);
    blendPixel(a, 0, "soft-light", 220, 220, 220, 1);
    expect(a[0]).toBeGreaterThan(128);
    const b = px(128, 128, 128, 255);
    blendPixel(b, 0, "soft-light", 30, 30, 30, 1);
    expect(b[0]).toBeLessThan(128);
  });

  // Fails if colour takes the source's luminosity: a red over mid grey must stay as bright as the grey.
  it("colour keeps the backdrop's luminosity and takes the source hue", () => {
    const d = px(128, 128, 128, 255);
    blendPixel(d, 0, "colour", 255, 0, 0, 1);
    expect(d[0]).toBeGreaterThan(d[1] ?? 0);
    const lum = 0.3 * (d[0] ?? 0) + 0.59 * (d[1] ?? 0) + 0.11 * (d[2] ?? 0);
    expect(Math.abs(lum - 128)).toBeLessThan(4);
  });

  // Fails if a blend mode over transparent backdrop mixes with black instead of acting as normal.
  it("modes over empty pixels behave as plain paint", () => {
    const d = px(0, 0, 0, 0);
    blendPixel(d, 0, "multiply", 90, 80, 70, 1);
    expect(Array.from(d)).toEqual([90, 80, 70, 255]);
  });
});
