import { describe, expect, it } from "vitest";
import { createFurnitureItem } from "./model";
import { furnitureMadeUrls, furniturePictureUrls, removedFurnitureUrls } from "./artUrls";
import type { PageFurnitureItem } from "@/scriptorium/types";

const asset = (bucket: string, path: string) => `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}`;
// Files the Illuminator made for u1, and pictures it did not.
const bakeA = asset("asset-images", "u1/ill-a.webp");
const bakeB = asset("asset-images", "u1/ill-b.webp");
const mask = asset("asset-images", "u1/ill-mask-1.webp");
const ownUpload = asset("asset-images", "u1/rte-170.webp");
const placeArt = asset("location-images", "u2/room.webp");
const recipe = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "mask", url: mask }] });

function art(props: Record<string, string>): PageFurnitureItem {
  const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
  return { ...item, props: { ...item.props, ...props } };
}

describe("furniturePictureUrls", () => {
  it("holds the bake, the original and the recipe's pictures of an art item", () => {
    const urls = furniturePictureUrls([art({ src: bakeA, original: ownUpload, illuminate: recipe })]);
    expect(urls.sort()).toEqual([bakeA, mask, ownUpload].sort());
  });

  it("ignores items that are not art", () => {
    const watercolor = createFurnitureItem("watercolor", { type: "page", chapterId: "c1", page: 1 });
    expect(furniturePictureUrls([{ ...watercolor, props: { ...watercolor.props, src: "x.png" } }])).toEqual([]);
  });
});

describe("removedFurnitureUrls", () => {
  it("the first bake never removes the original", () => {
    const before = [art({ src: ownUpload, original: ownUpload, illuminate: recipe })];
    const after = [art({ src: bakeA, original: ownUpload, illuminate: recipe, bakedFor: "h" })];
    expect(removedFurnitureUrls(before, after, "u1")).toEqual([]);
  });

  it("a superseded bake is removed", () => {
    const before = [art({ src: bakeA, original: ownUpload, illuminate: recipe })];
    const after = [art({ src: bakeB, original: ownUpload, illuminate: recipe })];
    expect(removedFurnitureUrls(before, after, "u1")).toEqual([bakeA]);
  });

  // Fails on: removing the art deleting its original, now that any picture of ours (a place's, the author's own) can be edited.
  it.each([
    ["a picture from another bucket", placeArt],
    ["a picture in the author's own pictures", ownUpload],
    ["a picture in asset-images that is another author's", asset("asset-images", "u2/portrait.webp")],
  ])("removing treated art never removes its original: %s", (_name, original) => {
    const before = [art({ src: bakeA, original, illuminate: recipe })];
    expect(removedFurnitureUrls(before, [], "u1").sort()).toEqual([bakeA, mask].sort());
  });

  // Fails on: Reset (src goes back to the original, the recipe and bake go) or a replacement deleting the original.
  it("resetting or replacing the picture removes the bake and mask, not the original", () => {
    const treated = art({ src: bakeA, original: placeArt, illuminate: recipe, bakedFor: "h" });
    const reset = { ...treated, props: { src: placeArt } };
    expect(removedFurnitureUrls([treated], [reset as PageFurnitureItem], "u1").sort()).toEqual([bakeA, mask].sort());
    const replaced = { ...treated, props: { src: ownUpload } };
    expect(removedFurnitureUrls([treated], [replaced as PageFurnitureItem], "u1").sort()).toEqual([bakeA, mask].sort());
  });

  // Fails on: plain art, never edited, being deleted when it leaves the page: it came from the picker, the book did not make it.
  it("removing art that was never edited removes nothing", () => {
    expect(removedFurnitureUrls([art({ src: ownUpload })], [], "u1")).toEqual([]);
    expect(removedFurnitureUrls([art({ src: placeArt })], [], "u1")).toEqual([]);
  });

  // Fails on: an `ill-` file under someone else's id being removed on the strength of its name.
  it("removes only the author's own files", () => {
    const theirs = asset("asset-images", "u2/ill-z.webp");
    expect(removedFurnitureUrls([art({ src: theirs, original: placeArt, illuminate: recipe })], [], "u1")).toEqual([mask]);
    expect(removedFurnitureUrls([art({ src: bakeA, original: placeArt, illuminate: recipe })], [], undefined)).toEqual([]);
  });

  it("keeps a bake another art item still holds", () => {
    const before = [art({ src: bakeA, original: placeArt }), art({ src: bakeA, original: placeArt })];
    expect(removedFurnitureUrls(before, [before[1]], "u1")).toEqual([]);
  });
});

describe("furnitureMadeUrls", () => {
  // Fails on: deleting a book leaving its page art's bake and masks behind, or taking the original with them.
  it("is every file the Illuminator made across the art items, never an original", () => {
    const items = [art({ src: bakeA, original: placeArt, illuminate: recipe }), art({ src: ownUpload })];
    expect(furnitureMadeUrls(items, "u1").sort()).toEqual([bakeA, mask].sort());
  });
});
