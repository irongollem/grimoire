import { describe, expect, it } from "vitest";
import { tilePackSlug, webpDimensions } from "./tilePackGeneration";

it("creates a bounded pack slug", () => {
  expect(tilePackSlug("  Moonlit Observatory!  ")).toBe("moonlit-observatory");
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

  it("rejects non-WebP bytes", () => {
    expect(webpDimensions(new Uint8Array(30))).toBeNull();
  });
});
