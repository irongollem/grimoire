import { describe, expect, it } from "vitest";
import { tilePackSlug, webpDimensions } from "./tilePackGeneration";

describe("tilePackSlug", () => {
  it.each([
    ["  Moonlit Observatory!  ", "moonlit-observatory"],
    ["Ruins -- of  Ash_&_Bone", "ruins-of-ash-bone"],
    ["---Crypt---", "crypt"],
  ])("turns %j into %j", (name, slug) => {
    expect(tilePackSlug(name)).toBe(slug);
  });

  it("cuts a long name at 64 characters", () => {
    expect(tilePackSlug("a".repeat(100))).toHaveLength(64);
  });
});

describe("webpDimensions", () => {
  it("reads lossless WebP dimensions", () => {
    const bytes = new Uint8Array(30);
    bytes.set([..."RIFF"].map((char) => char.charCodeAt(0)), 0);
    bytes.set([..."WEBPVP8L"].map((char) => char.charCodeAt(0)), 8);
    bytes[20] = 0x2f;
    bytes[21] = 127;
    bytes[22] = 0xc0;
    bytes[23] = 31;

    expect(webpDimensions(bytes)).toEqual({ width: 128, height: 128 });
  });

  // Layouts from the WebP container spec: VP8X stores width-1 and height-1 as
  // 24-bit little-endian at bytes 24 and 27; a lossy VP8 key frame stores 14-bit
  // little-endian width and height at bytes 26 and 28.
  const header = (fourCC: string) => {
    const bytes = new Uint8Array(30);
    bytes.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    bytes.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
    bytes.set([...fourCC].map((c) => c.charCodeAt(0)), 12);
    return bytes;
  };

  it("reads extended (VP8X) dimensions from the 24-bit fields", () => {
    const bytes = header("VP8X");
    bytes.set([0xff, 0x03, 0x00], 24); // width - 1 = 1023
    bytes.set([0xff, 0x01, 0x00], 27); // height - 1 = 511
    expect(webpDimensions(bytes)).toEqual({ width: 1024, height: 512 });
    bytes.set([0x00, 0x00, 0x01], 24); // width - 1 = 65536, which needs the third byte
    bytes.set([0x00, 0x00, 0x02], 27); // height - 1 = 131072
    expect(webpDimensions(bytes)).toEqual({ width: 65537, height: 131073 });
  });

  it("reads lossy (VP8) dimensions from the 14-bit fields, ignoring the scale bits above them", () => {
    const bytes = header("VP8 ");
    bytes.set([0x00, 0x42], 26); // 0x4200: scale bits 01, width 0x0200 = 512
    bytes.set([0x00, 0x01], 28); // height 256
    expect(webpDimensions(bytes)).toEqual({ width: 512, height: 256 });
  });

  it("reads a non-square lossless image, using both height bit groups", () => {
    const bytes = header("VP8L");
    bytes[20] = 0x2f;
    // width - 1 = 255 (14 bits), height - 1 = 1023 (14 bits): bits 0-13 and 14-27 of a little-endian word.
    const packed = 255 | (1023 << 14);
    bytes.set([packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >> 24) & 0xff], 21);
    expect(webpDimensions(bytes)).toEqual({ width: 256, height: 1024 });
  });

  it("rejects a lossless chunk without its signature byte, and anything shorter than a header", () => {
    const bytes = header("VP8L");
    expect(webpDimensions(bytes)).toBeNull();
    expect(webpDimensions(header("VP8X").subarray(0, 20))).toBeNull();
  });

  it("rejects non-WebP bytes", () => {
    expect(webpDimensions(new Uint8Array(30))).toBeNull();
  });
});
