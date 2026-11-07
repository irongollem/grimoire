import { describe, expect, it } from "vitest";
import { frameCover, frameSlices } from "./frameSlices";

describe("frameSlices", () => {
  // Bug: a 2:3 arch frame stretched over a 9:19.5 phone, its round arch squashed into a tall oval.
  it("keeps a tall frame's ends at their painted shape on a taller phone and stretches only the middle", () => {
    const slices = frameSlices({ width: 1024, height: 1536 }, { width: 390, height: 845 });
    const [top, middle, bottom] = [slices[0], slices[1], slices[4]];
    const scale = 390 / 1024;
    expect(top.to[3] / top.from[3]).toBeCloseTo(scale);
    expect(top.to[2] / top.from[2]).toBeCloseTo(scale);
    expect(bottom.to[1] + bottom.to[3]).toBeCloseTo(845);
    expect(middle.to[1]).toBeCloseTo(top.to[3]);
    expect(middle.to[1] + middle.to[3]).toBeCloseTo(slices[2].to[1]);
  });

  // Bug: a 3:2 frame on a 16:9 TV, its corner ornaments stretched sideways.
  it("keeps a wide frame's ends on a wider TV and stretches only the middle band across", () => {
    const slices = frameSlices({ width: 1536, height: 1024 }, { width: 1920, height: 1080 });
    const [left, right] = [slices[0], slices[4]];
    expect(left.to[2] / left.from[2]).toBeCloseTo(1080 / 1024);
    expect(right.to[0] + right.to[2]).toBeCloseTo(1920);
  });

  it("draws a frame whole on a screen of its own shape", () => {
    expect(frameSlices({ width: 1024, height: 1536 }, { width: 512, height: 768 })).toHaveLength(1);
  });

  // Bug: a window's cross in the middle band was stretched 3x on a phone; the centre must keep its painted scale.
  it("draws the centre slice at its painted length times the fit scale", () => {
    const slices = frameSlices({ width: 1024, height: 1536 }, { width: 390, height: 845 });
    expect(slices).toHaveLength(5);
    // Within a pixel: every slice edge is rounded to a whole pixel.
    expect(Math.abs(slices[2].to[3] - slices[2].from[3] * (390 / 1024))).toBeLessThanOrEqual(1);
  });

  // Bug: a gap or overlap between slices shows as a seam or a doubled bar.
  it.each([
    [{ width: 1024, height: 1536 }, { width: 390, height: 845 }, 1],
    [{ width: 1536, height: 1024 }, { width: 1920, height: 1080 }, 0],
  ])("tiles the screen with no gap or overlap and the image with no gap", (image, screen, axis) => {
    const slices = frameSlices(image, screen);
    let at = 0;
    let src = 0;
    for (const s of slices) {
      expect(s.to[axis]).toBeCloseTo(at);
      expect(s.from[axis]).toBeCloseTo(src);
      at += s.to[axis + 2];
      src += s.from[axis + 2];
    }
    expect(at).toBeCloseTo(axis ? screen.height : screen.width);
    expect(src).toBeCloseTo(axis ? image.height : image.width);
  });

  // Bug: slices met at fractional pixels, each half-covered the row between them, and the room showed through as a
  // hairline across a wooden window's sides.
  it("lays every slice on whole pixels", () => {
    for (const [image, screen] of [
      [{ width: 1024, height: 1536 }, { width: 390, height: 845 }],
      [{ width: 1536, height: 1024 }, { width: 1919, height: 1080 }],
    ] as const) {
      for (const s of frameSlices(image, screen)) for (const v of s.to) expect(Number.isInteger(v)).toBe(true);
    }
  });

  // Bug: on a screen barely longer than the frame the stretched bands came out shorter than painted, squashing them.
  it("never draws a stretched band shorter than it was painted", () => {
    const slices = frameSlices({ width: 1024, height: 1536 }, { width: 1000, height: 1540 });
    for (const band of [slices[1], slices[3]]) expect(band.to[3]).toBeGreaterThanOrEqual(band.from[3] * (1000 / 1024));
  });
});

describe("frameCover", () => {
  // Bug: stone stretched to the screen; it must scale evenly and crop the overflow equally on both sides.
  it("scales evenly and crops the overflow centred", () => {
    const c = frameCover({ width: 1000, height: 1000 }, { width: 500, height: 250 });
    expect(c.from).toEqual([0, 250, 1000, 500]);
    expect(c.to).toEqual([0, 0, 500, 250]);
    expect(c.to[2] / c.from[2]).toBeCloseTo(c.to[3] / c.from[3]);
  });
});
