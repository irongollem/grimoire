import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { captureImageGenerationContext } from "./useImageGeneration";
import { featureInsertFromAi, type FeatureAiResult } from "@/lib/codex/featureAi";
import type { ClassFeatureInsert } from "@/types/feature.types";
import type { Activation } from "@/rules/features/mechanics.types";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Ability",
  entityRoute: (id) => `/features/${id}`,
  openPanel: () => {
    useGeneratorUiStore().classFeatureGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface ClassFeatureGenerationOptions {
  /** How the ability is used; absent lets the model decide, and passive is the lack of one. */
  activation?: Activation;
  /** Free text: the class or species this ability is for. */
  forWhom?: string;
}

export function useClassFeatureGeneration() {
  const { ruleset } = useTableRuleset();

  /** Returns an ability row ready to insert (edition-shaped), or null on failure. */
  async function generate(
    userPrompt: string,
    options?: ClassFeatureGenerationOptions,
  ): Promise<ClassFeatureInsert | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      const context = captureImageGenerationContext();
      const constraints: string[] = [];
      if (options?.activation) constraints.push(`Activation: ${options.activation}`);
      const forWhom = options?.forWhom?.trim();
      if (forWhom) constraints.push(`For: ${forWhom.slice(0, 200)}`);

      const raw = await generateEntityText<FeatureAiResult>({
        generator: "class_feature",
        campaignId: context.campaignId,
        settingPrompt: context.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });
      const insert = featureInsertFromAi(
        { ...raw, ...(options?.activation ? { activation: options.activation } : {}) },
        { ruleset: ruleset.value, campaignId: context.campaignId },
      );
      if (!insert) throw new Error("The model did not return a usable ability. Try again.");
      return insert;
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
