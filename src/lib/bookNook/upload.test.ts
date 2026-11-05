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

import { uploadNookImage, removeNookImages } from "./upload";

const webp = new File(["x"], "n.webp", { type: "image/webp" });

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
