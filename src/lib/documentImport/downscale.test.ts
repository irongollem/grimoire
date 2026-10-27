// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import { downscalePagePhoto, targetDimensions, MAX_IMAGE_EDGE } from "./downscale";

describe("targetDimensions", () => {
  it("leaves an image already inside the cap alone", () => {
    expect(targetDimensions(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it("never upscales — an image exactly at the cap is untouched", () => {
    expect(targetDimensions(MAX_IMAGE_EDGE, 400)).toEqual({ width: MAX_IMAGE_EDGE, height: 400 });
  });

  it("caps the long edge of a landscape photo and keeps the aspect ratio", () => {
    const { width, height } = targetDimensions(4032, 3024);
    expect(width).toBe(MAX_IMAGE_EDGE);
    expect(height).toBe(1200);
    expect(width / height).toBeCloseTo(4032 / 3024, 5);
  });

  it("caps the long edge of a portrait photo — the page orientation a DM actually shoots", () => {
    const { width, height } = targetDimensions(3024, 4032);
    expect(height).toBe(MAX_IMAGE_EDGE);
    expect(width).toBe(1200);
  });

  it("honours an explicit maxEdge", () => {
    expect(targetDimensions(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });

  // A panorama-shaped scan rounds its short edge below one pixel; a zero-height
  // canvas throws in the browser rather than producing a small image.
  it("never rounds an extreme aspect ratio down to a zero dimension", () => {
    const { width, height } = targetDimensions(40000, 3, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(1);
  });

  it("returns degenerate input unchanged rather than dividing by zero", () => {
    expect(targetDimensions(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("downscalePagePhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A page photo of `bytes` bytes that the browser decodes as 3000x2000, re-encoding to a blob of `encodedBytes`. */
  function stubBrowser(encodedBytes: number): void {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 3000, height: 2000, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob([new Uint8Array(encodedBytes)], { type: "image/jpeg" })),
    );
  }
  const photo = (bytes: number, name = "page.png", type = "image/png") => new File([new Uint8Array(bytes)], name, { type });

  it("re-encodes a large photo as a smaller JPEG", async () => {
    stubBrowser(1000);
    const original = photo(5000, "page one.png");
    const out = await downscalePagePhoto(original);
    expect(out).not.toBe(original);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("page one.jpg");
    expect(out.size).toBe(1000);
  });

  it("keeps the original when the re-encode is not smaller", async () => {
    stubBrowser(5000);
    const original = photo(5000);
    expect(await downscalePagePhoto(original)).toBe(original);
  });

  it("leaves a non-image alone", async () => {
    stubBrowser(10);
    const pdf = photo(5000, "doc.pdf", "application/pdf");
    expect(await downscalePagePhoto(pdf)).toBe(pdf);
  });

  it("keeps the original when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("undecodable");
    });
    const original = photo(5000);
    expect(await downscalePagePhoto(original)).toBe(original);
  });
});
