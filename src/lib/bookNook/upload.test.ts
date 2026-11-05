import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toWebP: vi.fn(),
  uploadToBucket: vi.fn(),
  removeByPublicUrl: vi.fn(),
}));
vi.mock("@/lib/mediaConvert", () => ({ toWebP: mocks.toWebP }));
vi.mock("@/lib/storage", () => ({
  uploadToBucket: mocks.uploadToBucket,
  removeByPublicUrl: mocks.removeByPublicUrl,
}));

import { uploadNookImage, removeNookImages, nookFiles } from "./upload";

const webp = new File(["x"], "n.webp", { type: "image/webp" });

const CDN = "https://cdn.example.invalid/location-images";
const layer = (src: string) => ({ kind: "layer", id: src, src }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.toWebP.mockResolvedValue(webp);
});

describe("uploadNookImage", () => {
  it("stores under the owner's prefix, never srd/, and returns the url", async () => {
    mocks.uploadToBucket.mockResolvedValue("https://cdn.example.invalid/u1/nooks/n1/x.webp");
    const url = await uploadNookImage(new Blob(["p"], { type: "image/png" }), "n1", "u1");
    const arg = mocks.uploadToBucket.mock.calls[0][0] as { bucket: string; path: string; contentType: string };
    expect(arg.bucket).toBe("locationImages");
    expect(arg.path).toMatch(/^u1\/nooks\/n1\/[0-9a-f-]+\.webp$/);
    expect(arg.contentType).toBe("image/webp");
    expect(url).toBe("https://cdn.example.invalid/u1/nooks/n1/x.webp");
  });

  it("throws when the upload fails instead of returning a null url", async () => {
    mocks.uploadToBucket.mockResolvedValue(null);
    await expect(uploadNookImage(new Blob(["p"]), "n1", "u1")).rejects.toThrow(/stored/);
  });

  it("does not store the original as WebP when conversion fell back", async () => {
    mocks.toWebP.mockResolvedValue(new File(["x"], "n.png", { type: "image/png" }));
    await expect(uploadNookImage(new Blob(["p"]), "n1", "u1")).rejects.toThrow(/WebP/);
    expect(mocks.uploadToBucket).not.toHaveBeenCalled();
  });
});

describe("removeNookImages", () => {
  it("removes from the location-images bucket", async () => {
    await removeNookImages(["a", "b"]);
    expect(mocks.removeByPublicUrl).toHaveBeenCalledWith("locationImages", "a", "b");
  });
});

describe("nookFiles", () => {
  // Bug guard: deleting a nook must never remove a stock part or a place's own picture it merely points at.
  it("keeps only files under this nook's own folder, from layers, frames and the still", () => {
    const scene = {
      stack: [
        layer(`${CDN}/u1/nooks/n1/a.webp`),
        layer(`${CDN}/srd/nooks/lantern-1234567890.webp`),
        layer(`${CDN}/u1/nooks/n2/other.webp`),
        { kind: "effect", id: "e" },
      ],
      frame: { tall: `${CDN}/u1/nooks/n1/t.webp`, wide: `${CDN}/srd/nooks/frame.webp` },
    } as never;
    expect(nookFiles(scene, `${CDN}/u1/nooks/n1/still.webp?v=2`, "n1")).toEqual([
      `${CDN}/u1/nooks/n1/a.webp`,
      `${CDN}/u1/nooks/n1/t.webp`,
      `${CDN}/u1/nooks/n1/still.webp?v=2`,
    ]);
  });

  it("leaves a place's own picture and a missing still alone", () => {
    const scene = { stack: [layer(`${CDN}/u1/place-pic.webp`)] } as never;
    expect(nookFiles(scene, null, "n1")).toEqual([]);
  });

  it("does not repeat a file the scene and the still share", () => {
    const url = `${CDN}/u1/nooks/n1/a.webp`;
    expect(nookFiles({ stack: [layer(url)] } as never, url, "n1")).toEqual([url]);
  });
});
