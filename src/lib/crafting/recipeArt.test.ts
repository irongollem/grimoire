import { describe, expect, it } from "vitest";
import type { CraftingOutput } from "@/types/crafting.types";
import { primaryOutput, resolveRecipeArt, type ItemArt } from "./recipeArt";

function output(position: number, ref: { item_id?: string; library_item_id?: string }): CraftingOutput {
  return {
    id: `out-${position}`,
    recipe_id: "r1",
    item_id: ref.item_id ?? null,
    library_item_id: ref.library_item_id ?? null,
    quantity: 1,
    position,
  };
}

const art: Record<string, ItemArt> = {
  bow: { image_url: "https://cdn/bow.webp", image_focal_point: { x: 0.4, y: 0.2 } },
  arrows: { image_url: "https://cdn/arrows.webp" },
  bare: { image_url: null },
};
const find = (ref: string) => art[ref];

describe("primaryOutput", () => {
  it("takes the lowest position, whatever order the list is in", () => {
    expect(primaryOutput([output(1, { item_id: "arrows" }), output(0, { item_id: "bow" })])?.item_id).toBe("bow");
  });

  it("is undefined for a recipe with no outputs", () => {
    expect(primaryOutput([])).toBeUndefined();
  });
});

describe("resolveRecipeArt", () => {
  const noImage = { image_url: null, image_focal_point: null };

  it("prefers the DM's own image over the output's", () => {
    const custom = { image_url: "https://cdn/mine.webp", image_focal_point: { x: 0.1, y: 0.9 } };
    expect(resolveRecipeArt(custom, [output(0, { item_id: "bow" })], find)).toEqual({
      url: "https://cdn/mine.webp",
      focalPoint: { x: 0.1, y: 0.9 },
    });
  });

  it("falls back to the primary output's art and focal point", () => {
    const outputs = [output(1, { item_id: "arrows" }), output(0, { item_id: "bow" })];
    expect(resolveRecipeArt(noImage, outputs, find)).toEqual({ url: "https://cdn/bow.webp", focalPoint: { x: 0.4, y: 0.2 } });
  });

  it("resolves a library output through the same lookup", () => {
    expect(resolveRecipeArt(noImage, [output(0, { library_item_id: "arrows" })], find)).toEqual({
      url: "https://cdn/arrows.webp",
      focalPoint: null,
    });
  });

  it("does not borrow a secondary output's art when the primary has none", () => {
    const outputs = [output(0, { item_id: "bare" }), output(1, { item_id: "arrows" })];
    expect(resolveRecipeArt(noImage, outputs, find)).toBeNull();
  });

  it("is null when the output is not resolvable or there is none", () => {
    expect(resolveRecipeArt(noImage, [output(0, { item_id: "unknown" })], find)).toBeNull();
    expect(resolveRecipeArt(noImage, [], find)).toBeNull();
  });
});
