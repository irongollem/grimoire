import { describe, expect, it } from "vitest";
import { WORKBENCH_SPRITES } from "@/data/workbenchArt";
import { STARTER_RECIPES } from "@/data/starterRecipes";
import { spriteForItem, spriteForTags } from "./materialSprite";

const tint = (sprite: keyof typeof WORKBENCH_SPRITES, key: string) => WORKBENCH_SPRITES[sprite].tints?.[key];

describe("spriteForTags", () => {
  const cases: [string[], string, string | null][] = [
    [["gold", "ore"], "mat-ore", tint("mat-ore", "gold") ?? null],
    [["silver", "ingot"], "mat-ingot-iron", tint("mat-ingot-iron", "silver") ?? null],
    [["metal", "iron", "ingot"], "mat-ingot-iron", null],
    [["gem", "rough", "ruby"], "mat-gem-rough", tint("mat-gem-rough", "ruby") ?? null],
    [["gem", "rough", "moss agate"], "mat-gem-rough", tint("mat-gem-rough", "moss agate") ?? null],
    [["dye", "blue"], "mat-dye", tint("mat-dye", "blue") ?? null],
    [["oil"], "mat-flask", tint("mat-flask", "oil") ?? null],
    [["leather", "material"], "mat-leather", null],
    [["  Leather "], "mat-leather", null],
  ];

  it.each(cases)("%j -> %s", (tags, sprite, filter) => {
    expect(spriteForTags(tags)).toEqual({ sprite, filter });
  });

  it("the expected tint filters exist", () => {
    for (const [, , filter] of cases.filter(([t]) => t.includes("ruby") || t.includes("oil"))) {
      expect(filter).toBeTruthy();
    }
  });

  it("a describing tag never picks a sprite alone", () => {
    expect(spriteForTags(["material"])).toBeNull();
    expect(spriteForTags([])).toBeNull();
  });

  it("every starter recipe ingredient resolves to a real sprite, never the bundle", () => {
    for (const recipe of STARTER_RECIPES) {
      for (const ing of recipe.ingredients) {
        expect(spriteForTags(ing.tags), `${recipe.name}: ${ing.tags.join(",")}`).not.toBeNull();
      }
    }
  });
});

describe("spriteForItem", () => {
  it("uses tags first", () => {
    expect(spriteForItem({ tags: ["leather"], item_type: "potion" }).sprite).toBe("mat-leather");
  });
  it("falls back to the item type, untinted", () => {
    expect(spriteForItem({ tags: [], item_type: "potion" })).toEqual({ sprite: "mat-flask", filter: null });
  });
  it("falls back to the bundle for anything unknown", () => {
    expect(spriteForItem({ tags: ["mystery"], item_type: "gizmo" })).toEqual({ sprite: "mat-bundle", filter: null });
    expect(spriteForItem(null)).toEqual({ sprite: "mat-bundle", filter: null });
    expect(spriteForItem({ tags: null, item_type: null }).sprite).toBe("mat-bundle");
  });
});
