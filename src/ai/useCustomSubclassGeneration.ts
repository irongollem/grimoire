import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { captureImageGenerationContext } from "./useImageGeneration";
import {
  subclassDraftFromAi,
  subclassFeatureLevels,
  type SubclassAiResult,
  type SubclassDraft,
} from "@/lib/codex/subclassAi";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Archetype",
  entityRoute: (id) => `/levelup/custom/${id}`,
  openPanel: () => {
    useUiStore().customSubclassGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface CustomSubclassGenerationOptions {
  /** The parent class, a system or custom class the DM picked. */
  parentClassName: string;
  /** The parent class's `subclass_level`. */
  subclassLevel: number;
}

export function useCustomSubclassGeneration() {
  const { ruleset } = useTableRuleset();

  /** Returns a subclass draft (subclass row plus the feature rows it points at), or null on failure. Nothing is written. */
  async function generate(
    userPrompt: string,
    options: CustomSubclassGenerationOptions,
  ): Promise<SubclassDraft | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      const context = captureImageGenerationContext();
      const levels = subclassFeatureLevels({ ...options, ruleset: ruleset.value });
      const constraints = [
        `Parent class: ${options.parentClassName.slice(0, 80)}`,
        `Subclass feature levels (give features only at these levels): ${levels.join(", ")}`,
      ];

      const raw = await generateEntityText<SubclassAiResult>({
        generator: "custom_subclass",
        campaignId: context.campaignId,
        settingPrompt: context.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });
      const draft = subclassDraftFromAi(raw, {
        ruleset: ruleset.value,
        campaignId: context.campaignId,
        parentClassName: options.parentClassName,
        subclassLevel: options.subclassLevel,
      });
      if (draft.problems.length) {
        throw new Error(`The model did not return a usable subclass (${draft.problems[0]}) Try again.`);
      }
      return draft;
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
