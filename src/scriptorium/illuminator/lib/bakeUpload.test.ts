import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ BUCKETS: { assetImages: { maxBytes: 5 } }, uploadToBucket: upload }));
vi.mock("./bake", () => ({ bakePicture: vi.fn(async () => new Blob(["x"], { type: "image/webp" })) }));

import { bakeAndUpload, bakeKey, uploadBake } from "./bakeUpload";
import { hashSettings, type IlluminateSettings } from "./treatment";

const settings: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "mask", url: "m" }] };

beforeEach(() => upload.mockReset().mockResolvedValue("https://cdn/u1/ill.webp"));

describe("bake storage", () => {
  it("stores under a new key every time, so a late delete of the old bake cannot hit the new one", () => {
    expect(bakeKey("u1", "abc")).toMatch(/^u1\/ill-abc-[0-9a-f]{8}\.webp$/);
    expect(bakeKey("u1", "abc")).not.toBe(bakeKey("u1", "abc"));
  });

  it("uploads a WebP to asset-images and returns its URL", async () => {
    const url = await uploadBake(new Blob(["x"]), "u1", "abc");
    expect(url).toBe("https://cdn/u1/ill.webp");
    expect(upload.mock.calls[0][0]).toMatchObject({ bucket: "assetImages", contentType: "image/webp" });
  });

  it("fails loudly when the upload returns nothing, so a missing URL never becomes src", async () => {
    upload.mockResolvedValue(null);
    await expect(uploadBake(new Blob(["x"]), "u1", "abc")).rejects.toThrow();
  });

  it("returns the hash of the recipe it baked beside the URL", async () => {
    const result = await bakeAndUpload("https://cdn/o.webp", settings, "u1");
    expect(result).toEqual({ url: "https://cdn/u1/ill.webp", hash: hashSettings(settings) });
  });
});
