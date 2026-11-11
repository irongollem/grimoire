import { describe, expect, it } from "vitest";
import { blobToBase64 } from "./blobToBase64";

describe("blobToBase64", () => {
  // Bug: a non-chunked spread of a large picture overflows the call stack; bytes >= 0x80 must also survive.
  it("round-trips a blob larger than one chunk, with no data-URL prefix", async () => {
    const bytes = new Uint8Array(300_000 + 17).map((_, i) => (i * 31) % 256);
    const b64 = await blobToBase64(new Blob([bytes]));
    expect(b64.startsWith("data:")).toBe(false);
    expect(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))).toEqual(bytes);
  });

  it("encodes an empty blob as an empty string", async () => {
    expect(await blobToBase64(new Blob([]))).toBe("");
  });
});
