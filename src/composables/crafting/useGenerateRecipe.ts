/**
 * "Generate a recipe with AI and save it": the generation-to-create mapping `RecipeGeneratorPanel.vue` used to own
 * inline, extracted so Ask Grimoire (#1253) runs the same pipeline. The page generates, shows "this will create",
 * and calls `saveRecipe` on Create; Ask has its own quote instead of that step and calls `generateAndCreateRecipe`.
 *
 * A recipe is several writes. The first stage (the output item when the model invented one, then the recipe row)
 * throws, so the page can keep its confirm step and toast. Once the recipe exists, the second stage (outputs,
 * ingredients, modifiers) never throws: a failure there is `partsFailure`, so nobody is stranded without the recipe
 * and a retry cannot make a second one.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateItem } from "@/composables/items/useItems";
import {
  useCreateRecipe,
  useReplaceIngredients,
  useReplaceModifiers,
  useReplaceOutputs,
} from "@/composables/crafting/useCrafting";
import { useRecipeGeneration, type RecipeGenerationOptions } from "@/ai/useRecipeGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { isUuid } from "@/lib/library/contentIdentity";
import {
  resolveRecipeOutput,
  type NamedItem,
  type RecipeAiResult,
  type RecipeOutputResolution,
} from "@/lib/crafting/recipeAi";

export interface RecipeDraft {
  recipe: RecipeAiResult;
  resolution: RecipeOutputResolution;
}

export interface SavedRecipe {
  id: string;
  name: string;
  /** Set when outputs, ingredients or modifiers could not be written; the recipe itself is saved. */
  partsFailure: unknown;
}

export interface GenerateRecipeOutcome {
  recipe: SavedRecipe | null;
  error: string | null;
}

/**
 * Which item the recipe produces: the one the DM picked, else an item of the campaign or the shared library with
 * the model's output name, else a new item. A campaign item has a uuid id and a library item a text id.
 */
export function resolveRecipeOutputFor(
  recipe: RecipeAiResult,
  items: readonly NamedItem[],
  picked: NamedItem | null,
): RecipeOutputResolution {
  if (picked) {
    return isUuid(picked.id)
      ? { kind: "campaign", item_id: picked.id, name: picked.name }
      : { kind: "library", library_item_id: picked.id, name: picked.name };
  }
  return resolveRecipeOutput(
    recipe.output,
    items.filter((i) => isUuid(i.id)),
    items.filter((i) => !isUuid(i.id)),
  );
}

export function useGenerateRecipe() {
  const campaign = useCampaignStore();
  const { mutateAsync: createItem } = useCreateItem();
  const { mutateAsync: createRecipe } = useCreateRecipe();
  const { mutateAsync: replaceIngredients } = useReplaceIngredients();
  const { mutateAsync: replaceModifiers } = useReplaceModifiers();
  const { mutateAsync: replaceOutputs } = useReplaceOutputs();
  const generation = useRecipeGeneration();

  /** Throws if the output item or the recipe row cannot be written. */
  async function saveRecipe({ recipe, resolution }: RecipeDraft): Promise<SavedRecipe> {
    let outputRef: { item_id: string | null; library_item_id: string | null };
    if (resolution.kind === "create") {
      const created = await createItem({
        name: resolution.draft.name,
        item_type: resolution.draft.item_type,
        subtype: null,
        rarity: resolution.draft.rarity,
        requires_attunement: false,
        attunement_requirements: null,
        weight: null,
        cost: null,
        damage_rolls: null,
        armor_class: null,
        properties: [],
        charges: null,
        recharge: null,
        spell_ids: [],
        description: resolution.draft.description ? toTiptapJson(resolution.draft.description) : "",
        source: "Grimoire:AI",
        tags: [],
        image_url: null,
        image_focal_point: null,
        curse_description: null,
        is_arcane_focus: false,
        ai_provenance: recipe.ai_provenance ?? null,
        campaign_id: campaign.activeCampaignId ?? null,
      });
      outputRef = { item_id: created.id, library_item_id: null };
    } else if (resolution.kind === "campaign") {
      outputRef = { item_id: resolution.item_id, library_item_id: null };
    } else {
      outputRef = { item_id: null, library_item_id: resolution.library_item_id };
    }

    const created = await createRecipe({
      name: recipe.name,
      description: recipe.description ? toTiptapJson(recipe.description) : "",
      discipline: recipe.discipline,
      dc: recipe.dc,
      crafting_time: recipe.crafting_time,
      crafting_time_unit: recipe.crafting_time_unit,
      requires_proficiency: recipe.requires_proficiency,
      requires_tools: recipe.requires_tools,
      discoverable: false,
      player_visible_to: [],
      // No picture of its own: the card shows the output's art.
      image_url: null,
      image_focal_point: null,
      ai_provenance: recipe.ai_provenance ?? null,
    });
    const recipeId = created.id;

    // The recipe exists from here on: a failed child write is reported, never thrown.
    let partsFailure: unknown = null;
    try {
      await replaceOutputs({
        recipeId,
        outputs: [{ ...outputRef, quantity: recipe.output.quantity }],
      });
      await replaceIngredients({
        recipeId,
        ingredients: recipe.ingredients.map((i) => ({
          item_id: null,
          library_item_id: null,
          tags: i.tags,
          quantity: i.quantity,
        })),
      });
      await replaceModifiers({ recipeId, modifiers: recipe.modifiers });
    } catch (e) {
      partsFailure = e;
    }
    return { id: recipeId, name: recipe.name, partsFailure };
  }

  /** `items` is the campaign's item index, which the output is matched against. */
  async function generateAndCreateRecipe(
    concept: string,
    options: RecipeGenerationOptions & { items: readonly NamedItem[] },
  ): Promise<GenerateRecipeOutcome> {
    if (isAnyAiGenerating.value) return { recipe: null, error: "Another AI generation is already in progress." };
    generation.concept.value = concept;
    generation.clearCompleted();
    const { items, ...generationOptions } = options;
    const recipe = await generation.generate(concept, generationOptions);
    if (!recipe) return { recipe: null, error: generation.error.value ?? "Recipe generation failed." };
    const saved = await saveRecipe({ recipe, resolution: resolveRecipeOutputFor(recipe, items, null) });
    return { recipe: saved, error: null };
  }

  return { generation, saveRecipe, generateAndCreateRecipe };
}
