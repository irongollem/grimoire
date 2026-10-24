import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useAllRecipeOutputs } from "@/composables/crafting/useCrafting";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { inventoryItemRef } from "@/lib/itemRef";
import { primaryOutput, resolveRecipeArt, type RecipeArt } from "@/lib/crafting/recipeArt";
import type { CraftingRecipe } from "@/types/crafting.types";

/**
 * The picture each of the DM's recipes is shown with: their own image, else the
 * primary output's art. One batched outputs read for every recipe, and only the
 * primary outputs are resolved to items, read by id (never the whole catalogue).
 *
 * Player surfaces cannot use this: a player may not read a DM's vault item, so
 * `PlayerCraftingView` resolves through `useCraftableOutputItems` instead.
 */
export function useRecipeArt(recipes: MaybeRefOrGetter<readonly CraftingRecipe[]>) {
  const ids = computed(() => toValue(recipes).map((r) => r.id));
  const { map: outputsByRecipe } = useAllRecipeOutputs(ids);

  const { find } = useStoredItemRefs(() =>
    toValue(recipes)
      // A recipe with its own image never needs its output resolved.
      .filter((r) => !r.image_url)
      .map((r) => {
        const output = primaryOutput(outputsByRecipe.value.get(r.id) ?? []);
        return output ? inventoryItemRef(output) : null;
      }),
  );

  function artFor(recipe: CraftingRecipe): RecipeArt | null {
    return resolveRecipeArt(recipe, outputsByRecipe.value.get(recipe.id) ?? [], find);
  }

  return { artFor };
}
