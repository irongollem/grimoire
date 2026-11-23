import { describe, expect, it } from "vitest";
import { base64FromBytes } from "./base64.ts";

describe("base64FromBytes", () => {
  it("round-trips a buffer bigger than one chunk", () => {
    // Bug caught: encoding only the first chunk (or the whole buffer in one spread, which overflows the stack) corrupts large pictures.
    const bytes = new Uint8Array(0x8000 * 3 + 17).map((_, i) => (i * 31) % 256);
    const decoded = Uint8Array.from(atob(base64FromBytes(bytes)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });

  it("encodes nothing as an empty string", () => {
    expect(base64FromBytes(new Uint8Array())).toBe("");
  });
});
