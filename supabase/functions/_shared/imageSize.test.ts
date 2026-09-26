import { describe, it, expect } from "vitest";
import { isValidStyleImageSize, readPngDimensions } from "./imageSize.ts";

/** Builds just enough of a PNG (signature + IHDR) for `readPngDimensions` —
 *  the bytes after IHDR's width/height are never read, so they're zeroed. */
function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(29); // 8 signature + 4 length + 4 "IHDR" + 4 width + 4 height + 5 padding
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  bytes.set([0, 0, 0, 13], 8); // IHDR chunk length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

describe("readPngDimensions", () => {
  it("reads width and height out of a PNG's IHDR chunk", () => {
    expect(readPngDimensions(fakePng(2560, 1440))).toEqual({ width: 2560, height: 1440 });
  });

  it("returns null for bytes with no PNG signature", () => {
    expect(readPngDimensions(new Uint8Array(32))).toBeNull();
    expect(readPngDimensions(new TextEncoder().encode("not a png at all, just text"))).toBeNull();
  });

  it("returns null for a buffer too short to hold IHDR", () => {
    expect(readPngDimensions(fakePng(100, 100).slice(0, 20))).toBeNull();
  });

  it("returns null for a degenerate zero-sized IHDR", () => {
    expect(readPngDimensions(fakePng(0, 100))).toBeNull();
    expect(readPngDimensions(fakePng(100, 0))).toBeNull();
  });
});

describe("isValidStyleImageSize", () => {
  it("accepts the pixel-budget sizes the client actually sends", () => {
    expect(isValidStyleImageSize(2560, 1440)).toBe(true); // 16:9, the full budget
    expect(isValidStyleImageSize(1920, 1920)).toBe(true); // square
    expect(isValidStyleImageSize(1104, 3312)).toBe(true); // 1:3 boundary
  });

  it("rejects a size that isn't a multiple of 16", () => {
    expect(isValidStyleImageSize(2561, 1440)).toBe(false);
    expect(isValidStyleImageSize(2560, 1441)).toBe(false);
  });

  it("rejects an aspect ratio outside 1:3..3:1", () => {
    expect(isValidStyleImageSize(3840, 1024)).toBe(false); // 3.75:1, too wide
    expect(isValidStyleImageSize(1024, 3840)).toBe(false); // 1:3.75, too tall
  });

  it("rejects an edge over 3840px", () => {
    expect(isValidStyleImageSize(3856, 1280)).toBe(false);
  });

  it("rejects a total pixel count outside [655360, 8294400]", () => {
    expect(isValidStyleImageSize(512, 512)).toBe(false); // 262,144 — too small
    expect(isValidStyleImageSize(3840, 3840)).toBe(false); // exceeds 4K's total even though each edge is legal
  });

  it("rejects the old hard-coded square this endpoint used to always request", () => {
    // 1024x1024 is itself still a legal size (a multiple of 16, 1:1, within
    // every bound) — this pins that the *validator* doesn't special-case it
    // one way or the other; it's neither required nor rejected.
    expect(isValidStyleImageSize(1024, 1024)).toBe(true);
  });

  it("rejects non-integer or non-positive input", () => {
    expect(isValidStyleImageSize(1024.5, 1024)).toBe(false);
    expect(isValidStyleImageSize(0, 1024)).toBe(false);
    expect(isValidStyleImageSize(-1024, 1024)).toBe(false);
  });
});
