import { generateEntityText } from "./entityTextGeneration";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useAskUiStore } from "@/stores/ui/ask";
import { captureImageGenerationContext } from "./useImageGeneration";
import type { AiProvenance } from "./provenance";
import { normalizeCustomRule, type CustomRuleDraft } from "@/lib/rules/customRuleAi";

const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "House rule",
  entityRoute: (id) => `/rules/${id}`,
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
  openPanel: () => {
    useAskUiStore().openPanel();
  },
});

export interface CustomRuleGenerationOptions {
  category?: string;
  allowTracker?: boolean;
}

export type CustomRuleGenerated = CustomRuleDraft & { ai_provenance: AiProvenance | null };

export function useCustomRuleGeneration() {

  async function generate(
    userPrompt: string,
    options?: CustomRuleGenerationOptions,
  ): Promise<CustomRuleGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      const context = await captureImageGenerationContext();
      const constraints: string[] = [];
      if (options?.category) constraints.push(`Category: ${options.category}`);
      constraints.push(
        options?.allowTracker === false
          ? "Tracker: do not include one (set tracker to null)"
          : "Tracker: include one only if the rule tracks a value over time",
      );

      const raw = await generateEntityText<{ ai_provenance?: AiProvenance } & Record<string, unknown>>({
        generator: "custom_rule",
        campaignId: context.campaignId,
        prompt: userPrompt,
        constraints,
      });
      const draft = normalizeCustomRule(raw, options?.allowTracker !== false);
      if (!draft) throw new Error("The model did not return a usable rule. Try again.");
      return { ...draft, ai_provenance: raw.ai_provenance ?? null };
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
