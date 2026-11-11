import { describe, expect, it } from "vitest";
import { createFurnitureItem } from "./model";
import { furniturePictureUrls, removedFurnitureUrls } from "./artUrls";
import type { PageFurnitureItem } from "@/scriptorium/types";

const recipe = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "mask", url: "mask.png" }] });

function art(props: Record<string, string>): PageFurnitureItem {
  const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
  return { ...item, props: { ...item.props, ...props } };
}

describe("furniturePictureUrls", () => {
  it("holds the bake, the original and the recipe's pictures of an art item", () => {
    const urls = furniturePictureUrls([art({ src: "bake.webp", original: "orig.webp", illuminate: recipe })]);
    expect(urls.sort()).toEqual(["bake.webp", "mask.png", "orig.webp"]);
  });

  it("ignores items that are not art", () => {
    const watercolor = createFurnitureItem("watercolor", { type: "page", chapterId: "c1", page: 1 });
    expect(furniturePictureUrls([{ ...watercolor, props: { ...watercolor.props, src: "x.png" } }])).toEqual([]);
  });
});

describe("removedFurnitureUrls", () => {
  it("the first bake never removes the original", () => {
    const before = [art({ src: "orig.webp", original: "orig.webp", illuminate: recipe })];
    const after = [art({ src: "bake-a.webp", original: "orig.webp", illuminate: recipe, bakedFor: "h" })];
    expect(removedFurnitureUrls(before, after)).toEqual([]);
  });

  it("a superseded bake is removed", () => {
    const before = [art({ src: "bake-a.webp", original: "orig.webp", illuminate: recipe })];
    const after = [art({ src: "bake-b.webp", original: "orig.webp", illuminate: recipe })];
    expect(removedFurnitureUrls(before, after)).toEqual(["bake-a.webp"]);
  });

  it("an original is removed once no art holds it", () => {
    const before = [art({ src: "bake-a.webp", original: "orig.webp" })];
    expect(removedFurnitureUrls(before, []).sort()).toEqual(["bake-a.webp", "orig.webp"]);
  });
});
