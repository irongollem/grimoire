import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  useAllRecipeIngredients,
  useAllRecipeModifiers,
  useAllRecipeOutputs,
  useCraftableOutputItems,
  usePlayerCraftingRecipes,
} from "@/composables/crafting/useCrafting";
import { usePlayerItemProjection } from "@/composables/items/useItems";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { useParty } from "@/composables/party/useParty";
import { buildIngredientSlots, type IngredientSlot } from "@/lib/crafting/ingredients";
import { resolveRecipeArt, type RecipeArt } from "@/lib/crafting/recipeArt";
import { inventoryItemRef } from "@/lib/itemRef";
import { canonicalToolName, hasToolProficiency } from "@/rules/toolProficiency";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import type { CraftingIngredient, CraftingModifier, CraftingOutput, CraftingRecipe } from "@/types/crafting.types";

/**
 * What the Workshop list and the workbench both need about the player at the
 * bench: who they are, what they carry, which recipes they know and what each
 * one asks for. One copy, so the list's "have" counts and the bench agree.
 *
 * `recipeIds` narrows the ingredient, output and modifier reads (the workbench
 * wants one recipe, the list wants all of them); by default every known recipe.
 */
export function usePlayerCrafting(options: { recipeIds?: MaybeRefOrGetter<string[]> } = {}) {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  const { data: recipes, isLoading: recipesLoading } = usePlayerCraftingRecipes();
  const { data: projection } = usePlayerItemProjection();
  const { map: recipeItemNames, items: craftableItems } = useCraftableOutputItems();
  const { data: partyMembers, isLoading: partyLoading } = useParty();
  const { data: inventory, isLoading: inventoryLoading } = usePartyInventory();

  // The DM previewing a player sees that player's bench, else the linked character's.
  const member = computed(() => {
    const memberId = appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId;
    return partyMembers.value?.find((m) => m.id === memberId) ?? null;
  });

  const myInventory = computed(() =>
    (inventory.value ?? []).filter((i) => i.carried_by === member.value?.id || i.carried_by === null),
  );

  const recipeIds = computed(() => toValue(options.recipeIds) ?? (recipes.value ?? []).map((r) => r.id));
  const { map: ingredientsMap, ready: ingredientsReady } = useAllRecipeIngredients(recipeIds);
  const { map: outputsMap, ready: outputsReady } = useAllRecipeOutputs(recipeIds);
  const { map: modifiersMap, ready: modifiersReady } = useAllRecipeModifiers(recipeIds);
  // What a recipe asks for and makes has landed. Before then an empty slot list reads as "no
  // ingredients" and an empty output list as "makes nothing": a bench that acted on either would
  // craft for free, or spend the ingredients and make nothing.
  const recipeDetailsReady = computed(() => ingredientsReady.value && outputsReady.value && modifiersReady.value);

  // Carried rows, ingredients and outputs resolve in the player projection, plus
  // library ids read by id (#961, #972).
  const { items: allItems } = useStoredItemRefs(
    () => [
      ...myInventory.value.map(inventoryItemRef),
      ...[...ingredientsMap.value.values()].flat().map(inventoryItemRef),
      ...[...outputsMap.value.values()].flat().map(inventoryItemRef),
    ],
    projection,
  );

  const loading = computed(() => recipesLoading.value || partyLoading.value || inventoryLoading.value);

  function ingredientsFor(recipeId: string): CraftingIngredient[] {
    return ingredientsMap.value.get(recipeId) ?? [];
  }

  function modifiersFor(recipeId: string): CraftingModifier[] {
    return modifiersMap.value.get(recipeId) ?? [];
  }

  function outputsFor(recipeId: string): CraftingOutput[] {
    return outputsMap.value.get(recipeId) ?? [];
  }

  function itemName(ref: string | null): string {
    if (!ref) return "Unknown item";
    return (
      allItems.value.find((i) => i.id === ref)?.name ??
      // A recipe output the player has never held isn't in their visible items, so
      // resolve its name from the craftable-item projection (recipe outputs AND
      // ingredients) before giving up. It only covers vault items; a
      // library-referenced ref already resolved above via allItems.
      recipeItemNames.value.get(ref) ??
      "Unknown item"
    );
  }

  // A library output resolves through the player's visible items; a DM vault output
  // through the craftable-item projection, since a player may not read the vault row.
  function artFor(recipe: CraftingRecipe): RecipeArt | null {
    return resolveRecipeArt(recipe, outputsFor(recipe.id), (ref) =>
      allItems.value.find((i) => i.id === ref) ?? craftableItems.value.get(ref),
    );
  }

  // Any accepted tool counts. Both sides are canonicalised inside hasToolProficiency,
  // so a dirty stored value like "Herbalist kit" still satisfies "Herbalism Kit".
  function hasProficiency(tools: string[]): boolean {
    return hasToolProficiency(member.value?.tool_proficiencies, tools);
  }

  // The discipline's tool name is canonicalised before the substring match so a
  // differently-cased inventory row (e.g. "Forgery kit") still matches "Forgery Kit".
  function hasTools(tools: string[]): boolean {
    return tools.some((tool) => {
      const canonical = canonicalToolName(tool) ?? tool;
      return myInventory.value.some(
        (inv) => inv.name.toLowerCase().includes(canonical.toLowerCase()) && inv.quality !== "ruined",
      );
    });
  }

  /** The recipe's ingredients matched against what the player carries, by the same rule consumption uses. */
  function slotsFor(recipeId: string): IngredientSlot[] {
    return buildIngredientSlots(ingredientsFor(recipeId), myInventory.value, allItems.value, recipeItemNames.value);
  }

  return {
    recipes,
    member,
    myInventory,
    allItems,
    recipeItemNames,
    craftableItems,
    loading,
    recipeDetailsReady,
    ingredientsFor,
    modifiersFor,
    outputsFor,
    itemName,
    artFor,
    hasProficiency,
    hasTools,
    slotsFor,
  };
}

export type PlayerCrafting = ReturnType<typeof usePlayerCrafting>;
