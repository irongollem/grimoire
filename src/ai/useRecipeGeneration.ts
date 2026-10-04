import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { captureImageGenerationContext } from "./useImageGeneration";
import type { CraftingDiscipline } from "@/types/crafting.types";
import { normalizeRecipeAi, type RecipeAiResult } from "@/lib/crafting/recipeAi";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Recipe",
  entityRoute: (id) => `/crafting/${id}`,
  openPanel: () => {
    useUiStore().recipeGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface RecipeGenerationOptions {
  /** A CraftingDiscipline id the DM restricted the recipe to. */
  discipline?: CraftingDiscipline;
  /** Name of an existing item the DM wants the recipe to produce. */
  outputName?: string;
}

export function useRecipeGeneration() {
  const { ruleset } = useTableRuleset();

  async function generate(
    userPrompt: string,
    options?: RecipeGenerationOptions,
  ): Promise<RecipeAiResult | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    let imageContext: ReturnType<typeof captureImageGenerationContext>;
    try {
      imageContext = captureImageGenerationContext();
    } catch {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }

    try {
      const constraints: string[] = [];
      if (options?.discipline) constraints.push(`Discipline: ${options.discipline}`);
      if (options?.outputName) {
        constraints.push(`Output item (use this exact name): ${options.outputName.slice(0, 300)}`);
      }

      const raw = await generateEntityText<RecipeAiResult>({
        generator: "recipe",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });

      const recipe = normalizeRecipeAi(raw);
      if (!recipe) {
        _state.error.value = "The AI returned a recipe that could not be used. Try again.";
        return null;
      }
      // A DM-chosen discipline or output always wins over the model's drift.
      const result = { ...recipe };
      if (options?.discipline) result.discipline = options.discipline;
      if (options?.outputName) result.output = { ...result.output, name: options.outputName };
      return { ...result, ai_provenance: raw.ai_provenance };
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { ..._state, generate };
}
