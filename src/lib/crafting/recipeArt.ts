import type { CraftingOutput, CraftingRecipe } from "@/types/crafting.types";
import { inventoryItemRef } from "@/lib/itemRef";

export type FocalPoint = { x: number; y: number };

/** The picture a recipe is shown with. */
export interface RecipeArt {
  url: string;
  focalPoint: FocalPoint | null;
}

/** What a caller knows about an item's picture; any surface's item lookup fits. */
export interface ItemArt {
  image_url: string | null;
  image_focal_point?: FocalPoint | null;
}

/**
 * The output a recipe is "about": the one at position 0. Outputs normally arrive
 * ordered (every read is `order by position`), but a caller holding a list from
 * anywhere else still gets the right one.
 */
export function primaryOutput(outputs: readonly CraftingOutput[]): CraftingOutput | undefined {
  let best: CraftingOutput | undefined;
  for (const output of outputs) {
    if (!best || output.position < best.position) best = output;
  }
  return best;
}

/**
 * The DM's own image when they set one, else the art of the primary output, else
 * nothing (the card then shows its placeholder). Resolved at render time rather
 * than copied onto the recipe, so a recipe follows its item's picture when the
 * item's art changes. Only the primary output counts: a recipe for "a shortbow
 * and 20 arrows" is a shortbow recipe.
 */
export function resolveRecipeArt(
  recipe: Pick<CraftingRecipe, "image_url" | "image_focal_point">,
  outputs: readonly CraftingOutput[],
  findItem: (ref: string) => ItemArt | undefined,
): RecipeArt | null {
  if (recipe.image_url) return { url: recipe.image_url, focalPoint: recipe.image_focal_point };
  const output = primaryOutput(outputs);
  const ref = output ? inventoryItemRef(output) : null;
  const item = ref ? findItem(ref) : undefined;
  if (!item?.image_url) return null;
  return { url: item.image_url, focalPoint: item.image_focal_point ?? null };
}
