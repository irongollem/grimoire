import { describe, it, expect } from "vitest";
import { blobToBase64, base64ToBlob, canvasToWebp, WEBP_UNSUPPORTED } from "./imageCodec";

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

describe("canvasToWebp", () => {
  /** A canvas whose `toBlob` returns what the browser would, whatever was asked for. */
  function canvasEncodingAs(type: string | null): HTMLCanvasElement {
    return {
      toBlob: (callback: BlobCallback) => callback(type === null ? null : new Blob([new Uint8Array([1])], { type })),
    } as unknown as HTMLCanvasElement;
  }

  it("resolves the WebP blob when the browser encoded one", async () => {
    const blob = await canvasToWebp(canvasEncodingAs("image/webp"), 0.9);
    expect(blob.type).toBe("image/webp");
  });

  it("rejects the PNG a browser without a WebP encoder hands back instead", async () => {
    await expect(canvasToWebp(canvasEncodingAs("image/png"), 0.9)).rejects.toThrow(WEBP_UNSUPPORTED);
  });

  it("rejects when the browser produced nothing", async () => {
    await expect(canvasToWebp(canvasEncodingAs(null), 0.9)).rejects.toThrow("could not encode");
  });
});
