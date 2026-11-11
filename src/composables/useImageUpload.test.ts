import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const toWebP = vi.hoisted(() => vi.fn());
const uploadWithVariants = vi.hoisted(() => vi.fn());
const removeByPublicUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mediaConvert", () => ({ toWebP }));
vi.mock("@/lib/storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage")>()),
  uploadWithVariants,
  uploadToBucket: uploadWithVariants,
  removeByPublicUrl,
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));

import { getPublicUrl } from "@/lib/storage";
import { cleanupRemovedRichTextImages, extractRichTextImageUrls, useImageUpload } from "./useImageUpload";

describe("useImageUpload maxPx", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    toWebP.mockReset().mockResolvedValue(new File(["x"], "a.webp", { type: "image/webp" }));
    uploadWithVariants.mockReset().mockResolvedValue("https://cdn/x.webp");
  });

  // #1125 decision 6: a map still asks for 4096 px; every other caller keeps the 1920 default.
  it("passes the caller's long-edge limit on to the re-encode", async () => {
    await useImageUpload("location-images", { maxPx: 4096 }).upload(new File(["y"], "m.png"));
    expect(toWebP.mock.calls[0][1]).toBe(4096);
  });

  it("leaves the limit unset for callers that did not ask, so toWebP keeps its 1920 default", async () => {
    await useImageUpload("location-images").upload(new File(["y"], "m.png"));
    expect(toWebP.mock.calls[0][1]).toBeUndefined();
  });
});

// A treated picture (#1176 story 9) holds its original and its recipe's pictures as well as its src.
describe("rich-text image cleanup with treated pictures", () => {
  const url = (name: string) => getPublicUrl("assetImages", `u1/${name}.webp`);
  const orig = url("orig");
  const bakeA = url("bake-a");
  const bakeB = url("bake-b");
  const mask = url("mask");

  const recipe = (maskUrl: string) => ({ v: 1, seed: 1, steps: [{ type: "mask", url: maskUrl }] });
  const doc = (...images: Record<string, unknown>[]) =>
    JSON.stringify({ type: "doc", content: images.map((attrs) => ({ type: "image", attrs })) });
  const removed = () => removeByPublicUrl.mock.calls.flatMap((c) => c.slice(1)) as string[];

  beforeEach(() => removeByPublicUrl.mockReset().mockResolvedValue(undefined));

  it("collects the original and the recipe's pictures beside src", () => {
    const json = doc({ src: bakeA, original: orig, illuminate: recipe(mask), bakedFor: "h" });
    expect(extractRichTextImageUrls(json).sort()).toEqual([bakeA, mask, orig].sort());
  });

  it("the first bake never deletes the original", () => {
    const before = doc({ src: orig, original: orig, illuminate: recipe(mask) });
    const after = doc({ src: bakeA, original: orig, illuminate: recipe(mask), bakedFor: "h" });
    cleanupRemovedRichTextImages(before, after);
    expect(removed()).toEqual([]);
  });

  it("a superseded bake is deleted the moment the new src lands, and nothing else", () => {
    const before = doc({ src: bakeA, original: orig, illuminate: recipe(mask), bakedFor: "h1" });
    const after = doc({ src: bakeB, original: orig, illuminate: recipe(mask), bakedFor: "h2" });
    cleanupRemovedRichTextImages(before, after);
    expect(removed()).toEqual([bakeA]);
  });

  it("an original is deleted once nothing references it, with its bake and mask", () => {
    const before = doc({ src: bakeA, original: orig, illuminate: recipe(mask), bakedFor: "h1" });
    cleanupRemovedRichTextImages(before, doc());
    expect(removed().sort()).toEqual([bakeA, mask, orig].sort());
  });

  it("keeps an original that another picture still references", () => {
    const before = doc({ src: bakeA, original: orig, illuminate: recipe(mask) }, { src: orig });
    cleanupRemovedRichTextImages(before, doc({ src: orig }));
    expect(removed().sort()).toEqual([bakeA, mask].sort());
  });

  it("still deletes a plain removed picture, as before", () => {
    cleanupRemovedRichTextImages(doc({ src: orig }), doc());
    expect(removed()).toEqual([orig]);
  });
});
