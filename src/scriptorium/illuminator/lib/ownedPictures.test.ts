import { describe, expect, it } from "vitest";
import { heldUrls, isMadeByIlluminator, madeUrls } from "./ownedPictures";

const asset = (bucket: string, path: string) => `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}`;
const cdn = (bucket: string, path: string) => `https://cdn.example.com/${bucket}/${path}`;
const recipe = (url: string) => ({ v: 1, seed: 1, steps: [{ type: "mask", url }] });

describe("isMadeByIlluminator", () => {
  it("is a file named ill-... directly under the author's id in asset-images, in either URL shape", () => {
    expect(isMadeByIlluminator(asset("asset-images", "u1/ill-a.webp"), "u1")).toBe(true);
    expect(isMadeByIlluminator(cdn("asset-images", "u1/ill-a.webp"), "u1")).toBe(true);
  });

  // Fails on: a picture the author keeps or someone else made being taken for the Illuminator's.
  it.each([
    ["another bucket", asset("location-images", "u1/ill-a.webp")],
    ["another author", asset("asset-images", "u2/ill-a.webp")],
    ["a file not named like one", asset("asset-images", "u1/rte-1.webp")],
    ["a nested path", asset("asset-images", "u1/sub/ill-a.webp")],
    ["an outside picture", "https://elsewhere.example/u1/ill-a.webp"],
  ])("is not %s", (_name, url) => {
    expect(isMadeByIlluminator(url, "u1")).toBe(false);
  });

  // Fails on: no signed-in author matching the literal folder "undefined".
  it("is nothing without an author, even for a folder that spells the missing id", () => {
    expect(isMadeByIlluminator(asset("asset-images", "undefined/ill-a.webp"), undefined)).toBe(false);
    expect(isMadeByIlluminator(asset("asset-images", "null/ill-a.webp"), null)).toBe(false);
  });
});

describe("madeUrls", () => {
  const bake = asset("asset-images", "u1/ill-bake.webp");
  const mask = asset("asset-images", "u1/ill-mask-1.webp");
  const ai = asset("asset-images", "u1/ill-ai-1.webp");

  it("is the bake, the mask and the AI result of a treated picture", () => {
    const illuminate = { v: 1, seed: 1, steps: [{ type: "ai", action: "ink", output: ai }, { type: "mask", url: mask }] };
    expect(madeUrls({ src: bake, original: asset("location-images", "u2/room.webp"), illuminate }, "u1").sort()).toEqual([ai, bake, mask].sort());
  });

  // Fails on: an original that happens to be one of the author's own ill- files (a picture picked from their
  // pictures that was itself a bake) being deleted with the picture, because of how it is named.
  it("never includes the original, even when it is one of the author's own ill- files", () => {
    expect(madeUrls({ src: bake, original: mask, illuminate: recipe(mask) }, "u1")).toEqual([bake]);
    expect(madeUrls({ src: bake, original: bake }, "u1")).toEqual([]);
  });

  it("is nothing for a picture that was never edited and was not made here", () => {
    expect(madeUrls({ src: asset("asset-images", "u1/rte-1.webp") }, "u1")).toEqual([]);
  });
});

describe("heldUrls", () => {
  it("includes the original, so what is still held is never removed", () => {
    const original = asset("location-images", "u2/room.webp");
    expect(heldUrls({ src: "a", original, illuminate: recipe("m") }).sort()).toEqual(["a", "m", original].sort());
  });
});
