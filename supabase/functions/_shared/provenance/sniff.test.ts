import { describe, it, expect } from "vitest";
import { sniffImageFormat } from "./sniff";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("sniffImageFormat", () => {
  it("detects a PNG signature", () => {
    expect(sniffImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
  });

  it("detects a JPEG SOI marker", () => {
    expect(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
  });

  it("detects a RIFF/WEBP container", () => {
    const riffWebp = [
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x10, 0x00, 0x00, 0x00, // size (irrelevant to sniffing)
      0x57, 0x45, 0x42, 0x50, // "WEBP"
    ];
    expect(sniffImageFormat(bytes(...riffWebp))).toBe("image/webp");
  });

  it("returns null for a RIFF container that isn't WEBP (e.g. WAV)", () => {
    const riffWave = [
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x10, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // "WAVE"
    ];
    expect(sniffImageFormat(bytes(...riffWave))).toBeNull();
  });

  it("returns null for an unrelated format (GIF)", () => {
    expect(sniffImageFormat(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBeNull();
  });

  it("returns null for empty bytes", () => {
    expect(sniffImageFormat(new Uint8Array(0))).toBeNull();
  });

  it("returns null for bytes too short to carry any signature", () => {
    expect(sniffImageFormat(bytes(0x89, 0x50))).toBeNull();
  });
});
