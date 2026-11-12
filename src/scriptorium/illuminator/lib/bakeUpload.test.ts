import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  provenance: vi.fn(),
  embed: vi.fn((bytes: Uint8Array, packet: string) => new Uint8Array([...bytes, ...new TextEncoder().encode(packet)])),
}));
const upload = mocks.upload;
vi.mock("@/lib/storage", () => ({
  BUCKETS: { assetImages: { maxBytes: 5 } },
  uploadToBucket: mocks.upload,
  imageProvenanceKey: (url: string) => ({ bucket: "asset-images", stem: url }),
  loadImageProvenance: mocks.provenance,
}));
vi.mock("@edge-shared/provenance/embed.ts", () => ({ embedXmpInWebp: mocks.embed }));
vi.mock("./bake", () => ({ bakePicture: vi.fn(async () => new Blob(["x"], { type: "image/webp" })) }));

import { bakeAndUpload, bakeKey, markAiBake, uploadBake } from "./bakeUpload";
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

describe("an AI picture's bake keeps its label", () => {
  const aiRecipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "ai", action: "ink", output: "https://cdn/u1/ill-ai-1.webp" }] };
  const prov = { generatorType: "illuminate_ink", provider: "openai", model: "m", generatedAt: "2026-11-11T00:00:00Z", edited: false };

  beforeEach(() => mocks.provenance.mockReset().mockResolvedValue(prov));

  // Bug: the canvas re-encode dropped the XMP mark, so the player's copy of an AI picture carried no label.
  it("embeds the AI picture's provenance, flagged edited, in the bake before it is stored", async () => {
    const out = await markAiBake(new Blob(["x"], { type: "image/webp" }), aiRecipe);
    const [, packet] = mocks.embed.mock.calls[0];
    expect(packet).toContain("illuminate_ink");
    expect(packet).toMatch(/true/);
    expect(out.size).toBeGreaterThan(1);
  });

  it("leaves a recipe without an AI step alone", async () => {
    const blob = new Blob(["x"]);
    expect(await markAiBake(blob, settings)).toBe(blob);
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  // Bug: storing an unlabelled bake of an AI picture when its mark cannot be found.
  it("refuses to store an unlabelled bake when the AI picture's provenance cannot be found", async () => {
    mocks.provenance.mockResolvedValue(null);
    await expect(bakeAndUpload("https://cdn/o.webp", aiRecipe, "u1")).rejects.toThrow(/AI label/);
    expect(upload).not.toHaveBeenCalled();
  });
});
