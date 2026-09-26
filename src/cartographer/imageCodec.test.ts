import { describe, it, expect } from "vitest";
import { blobToBase64, base64ToBlob } from "./imageCodec";

describe("blobToBase64 / base64ToBlob round trip", () => {
  it("round-trips arbitrary bytes, including values >= 0x80", async () => {
    const bytes = new Uint8Array([0, 1, 2, 63, 64, 65, 127, 128, 129, 200, 254, 255]);
    const blob = new Blob([bytes], { type: "application/octet-stream" });

    const b64 = await blobToBase64(blob);
    const roundTripped = base64ToBlob(b64, "application/octet-stream");
    const roundTrippedBytes = new Uint8Array(await roundTripped.arrayBuffer());

    expect(Array.from(roundTrippedBytes)).toEqual(Array.from(bytes));
  });

  it("round-trips an empty blob", async () => {
    const blob = new Blob([], { type: "image/png" });

    const b64 = await blobToBase64(blob);
    expect(b64).toBe("");

    const roundTripped = base64ToBlob(b64, "image/png");
    expect(roundTripped.size).toBe(0);
  });

  it("preserves the requested content type on the decoded blob", () => {
    const blob = base64ToBlob("AAA=", "image/webp");
    expect(blob.type).toBe("image/webp");
  });

  it("produces base64 that matches the platform btoa for plain-ASCII input", async () => {
    const text = "hello world";
    const blob = new Blob([text], { type: "text/plain" });
    const b64 = await blobToBase64(blob);
    expect(b64).toBe(btoa(text));
  });
});
