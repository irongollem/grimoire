import { describe, expect, it } from "vitest";
import { detectMotion } from "./motionDetect";

const bytes = (...parts: (number[] | Uint8Array | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [...p])));
const file = (data: Uint8Array, name: string, type = "") => new File([data as BlobPart], name, { type });
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

// GIF89a spec: header, logical screen descriptor, then blocks; 0x2C = image, 0x3B = trailer.
const gifFrame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0]; // 1x1, no local table, one data sub-block
const gifGraphicControl = [0x21, 0xf9, 4, 0, 10, 0, 0, 0];
const gifHead = bytes("GIF89a", [1, 0, 1, 0, 0x00, 0, 0]);

describe("detectMotion", () => {
  it("calls any video/* file a video, whatever its name", async () => {
    expect(await detectMotion(file(bytes("xxxx"), "a.png", "video/webm"))).toBe("video");
  });

  it("calls a one-frame GIF still and a two-frame GIF animated, skipping extension blocks", async () => {
    const one = bytes(gifHead, gifGraphicControl, gifFrame, [0x3b]);
    const two = bytes(gifHead, gifGraphicControl, gifFrame, gifGraphicControl, gifFrame, [0x3b]);
    expect(await detectMotion(file(one, "a.gif", "image/gif"))).toBe("still");
    expect(await detectMotion(file(two, "a.gif", "image/gif"))).toBe("animated");
  });

  it("walks past a global colour table to find the frames", async () => {
    const head = bytes("GIF89a", [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255]); // 2-entry table
    const two = bytes(head, gifFrame, gifFrame, [0x3b]);
    expect(await detectMotion(file(two, "a.gif"))).toBe("animated");
  });

  // WebP container spec: VP8X flags byte at 20, bit 1 = animation.
  const webp = (flags: number) => bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [flags, 0, 0, 0], [0, 0, 0, 0, 0, 0], "ANIM");
  it("reads the WebP animation flag", async () => {
    expect(await detectMotion(file(webp(0x02), "a.webp"))).toBe("animated");
    expect(await detectMotion(file(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0]), "a.webp"))).toBe("still");
  });

  it("does not take a VP8X webp without the flag for animated", async () => {
    const still = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0x10, 0, 0, 0], Array.from({ length: 6 }, () => 0), "ICCP");
    expect(await detectMotion(file(still, "a.webp"))).toBe("still");
  });

  // APNG spec: acTL must precede the first IDAT.
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, len: number) => bytes(u32be(len), type, Array.from({ length: len }, () => 0), [0, 0, 0, 0]);
  it("finds acTL after other chunks and ignores one that comes after IDAT", async () => {
    const apng = bytes(sig, chunk("IHDR", 13), chunk("iCCP", 40), chunk("acTL", 8), chunk("IDAT", 4), chunk("IEND", 0));
    const lateActl = bytes(sig, chunk("IHDR", 13), chunk("IDAT", 4), chunk("acTL", 8), chunk("IEND", 0));
    const plain = bytes(sig, chunk("IHDR", 13), chunk("IDAT", 4), chunk("IEND", 0));
    expect(await detectMotion(file(apng, "a.png"))).toBe("animated");
    expect(await detectMotion(file(lateActl, "a.png"))).toBe("still");
    expect(await detectMotion(file(plain, "a.png"))).toBe("still");
  });

  it("calls a JPEG or unknown bytes still", async () => {
    expect(await detectMotion(file(bytes([0xff, 0xd8, 0xff, 0xe0]), "a.jpg"))).toBe("still");
  });
});
