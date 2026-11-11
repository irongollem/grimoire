import { describe, expect, it } from "vitest";
import { getPublicUrl } from "@/lib/storage";
import { chapterUrlsRemoved, chapterUrlsToDelete, heldChapterUrls } from "./chapterImages";

const url = (name: string) => getPublicUrl("assetImages", `u1/${name}.webp`);
const own = url("rte-170");
const bakeA = url("ill-bake-a");
const bakeB = url("ill-bake-b");
const mask = url("ill-mask-1");
const placeArt = getPublicUrl("locationImages", "u2/room.webp");
const theirs = getPublicUrl("assetImages", "u2/portrait.webp");

const recipe = (maskUrl: string) => ({ v: 1, seed: 1, steps: [{ type: "mask", url: maskUrl }] });
const doc = (...images: Record<string, unknown>[]) => JSON.stringify({ type: "doc", content: images.map((attrs) => ({ type: "image", attrs })) });
const removed = (before: string, after: string) => chapterUrlsRemoved(before, after, "u1").sort();

describe("a chapter's picture cleanup", () => {
  it("holds the original and the recipe's pictures beside src", () => {
    const json = doc({ src: bakeA, original: own, illuminate: recipe(mask), bakedFor: "h" });
    expect([...heldChapterUrls(json)].sort()).toEqual([bakeA, mask, own].sort());
  });

  // Fails on: the first bake reading as "the original was removed".
  it("the first bake never deletes the original", () => {
    const before = doc({ src: own, original: own, illuminate: recipe(mask) });
    const after = doc({ src: bakeA, original: own, illuminate: recipe(mask), bakedFor: "h" });
    expect(removed(before, after)).toEqual([]);
  });

  it("a superseded bake is deleted the moment the new one lands, and nothing else", () => {
    const before = doc({ src: bakeA, original: placeArt, illuminate: recipe(mask), bakedFor: "h1" });
    const after = doc({ src: bakeB, original: placeArt, illuminate: recipe(mask), bakedFor: "h2" });
    expect(removed(before, after)).toEqual([bakeA]);
  });

  // Fails on: removing the picture deleting its original, which may be a place's art, another author's picture or the author's own.
  it.each([
    ["a picture from another bucket", placeArt],
    ["a picture in the author's own pictures", own],
    ["a picture in asset-images that is another author's", theirs],
    ["one of the author's own ill- files, picked as a picture", mask],
  ])("removing a treated picture deletes its bake and mask, never its original: %s", (_name, original) => {
    const before = doc({ src: bakeA, original, illuminate: recipe(mask), bakedFor: "h1" });
    expect(removed(before, doc())).toEqual(original === mask ? [bakeA] : [bakeA, mask].sort());
  });

  // Fails on: Reset or Replace taking the original with the bake.
  it("resetting or replacing a treated picture keeps the original", () => {
    const treated = doc({ src: bakeA, original: placeArt, illuminate: recipe(mask), bakedFor: "h1" });
    expect(removed(treated, doc({ src: placeArt }))).toEqual([bakeA, mask].sort());
    expect(removed(treated, doc({ src: own }))).toEqual([bakeA, mask].sort());
  });

  // Fails on: a picture picked into the book being deleted from the author's pictures when it leaves.
  it("removing a picture nobody edited deletes nothing", () => {
    expect(removed(doc({ src: own }), doc())).toEqual([]);
    expect(removed(doc({ src: placeArt }), doc())).toEqual([]);
  });

  // Fails on: deleting a file named like a bake that is not the signed-in author's.
  it("never deletes another author's files, whatever they are called", () => {
    const before = doc({ src: getPublicUrl("assetImages", "u2/ill-x.webp"), original: placeArt, illuminate: recipe(mask) });
    expect(removed(before, doc())).toEqual([mask]);
  });

  it("deleting a whole chapter removes what the Illuminator made and keeps every original", () => {
    const json = doc({ src: bakeA, original: own, illuminate: recipe(mask) }, { src: placeArt });
    expect(chapterUrlsToDelete(json, "u1").sort()).toEqual([bakeA, mask].sort());
  });

  it("keeps a made file that another picture still refers to", () => {
    const before = doc({ src: bakeA, original: own, illuminate: recipe(mask) }, { src: mask });
    expect(removed(before, doc({ src: mask }))).toEqual([bakeA]);
  });

  it("deletes nothing when no one is signed in", () => {
    expect(chapterUrlsToDelete(doc({ src: bakeA, original: own }), null)).toEqual([]);
  });
});
