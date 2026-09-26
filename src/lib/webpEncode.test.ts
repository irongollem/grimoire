import { describe, it, expect, vi, beforeEach } from "vitest";

const encodeMock = vi.fn();
// Lazy-imported by the module under test — mocked so a test never actually
// downloads/instantiates the WASM codec, and so "was it touched" is checkable.
vi.mock("@jsquash/webp/encode", () => ({ default: (...args: unknown[]) => encodeMock(...args) }));

import { encodeWebp } from "./webpEncode";

/** A canvas whose `toBlob` returns what the browser would, whatever was asked for. */
function canvasEncodingAs(nativeType: string | null): HTMLCanvasElement {
  return {
    width: 2,
    height: 2,
    toBlob: (callback: BlobCallback) => callback(nativeType === null ? null : new Blob([new Uint8Array([1])], { type: nativeType })),
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    }),
  } as unknown as HTMLCanvasElement;
}

/** An OffscreenCanvas-shaped object whose `convertToBlob` returns what the browser would. */
function offscreenCanvasEncodingAs(nativeType: string | null): OffscreenCanvas {
  return {
    width: 2,
    height: 2,
    convertToBlob: () => Promise.resolve(nativeType === null ? null : new Blob([new Uint8Array([1])], { type: nativeType })),
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
    }),
  } as unknown as OffscreenCanvas;
}

describe("encodeWebp", () => {
  beforeEach(() => {
    encodeMock.mockReset();
  });

  it("returns the native WebP blob untouched, never importing the WASM encoder", async () => {
    const blob = await encodeWebp(canvasEncodingAs("image/webp"), 0.9);
    expect(blob.type).toBe("image/webp");
    expect(encodeMock).not.toHaveBeenCalled();
  });

  it("falls back to the WASM encoder when the browser hands back a PNG instead of WebP (Safari)", async () => {
    encodeMock.mockResolvedValue(new ArrayBuffer(8));
    const blob = await encodeWebp(canvasEncodingAs("image/png"), 0.9);
    expect(blob.type).toBe("image/webp");
    expect(encodeMock).toHaveBeenCalledTimes(1);
    const [imageData, options] = encodeMock.mock.calls[0]!;
    expect(imageData).toEqual({ data: expect.any(Uint8ClampedArray), width: 2, height: 2 });
    expect(options).toEqual({ quality: 90 });
  });

  it("falls back to the WASM encoder when the native encoder produces nothing at all", async () => {
    encodeMock.mockResolvedValue(new ArrayBuffer(8));
    const blob = await encodeWebp(canvasEncodingAs(null), 0.5);
    expect(blob.type).toBe("image/webp");
    expect(encodeMock.mock.calls[0]![1]).toEqual({ quality: 50 });
  });

  it("encodes an OffscreenCanvas-shaped object through convertToBlob", async () => {
    const blob = await encodeWebp(offscreenCanvasEncodingAs("image/webp"), 0.9);
    expect(blob.type).toBe("image/webp");
    expect(encodeMock).not.toHaveBeenCalled();
  });

  it("falls back to the WASM encoder for an OffscreenCanvas whose native encode isn't WebP", async () => {
    encodeMock.mockResolvedValue(new ArrayBuffer(8));
    const blob = await encodeWebp(offscreenCanvasEncodingAs("image/png"), 0.85);
    expect(blob.type).toBe("image/webp");
    expect(encodeMock.mock.calls[0]![1]).toEqual({ quality: 85 });
  });

  it("throws a clear, user-facing message when the WASM fallback itself fails", async () => {
    encodeMock.mockRejectedValue(new Error("boom"));
    await expect(encodeWebp(canvasEncodingAs("image/png"), 0.9)).rejects.toThrow(/can't encode WebP/);
  });
});
