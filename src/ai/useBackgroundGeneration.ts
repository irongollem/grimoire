import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { captureImageGenerationContext } from "./useImageGeneration";
import { backgroundInsertFromAi, type BackgroundAiResult } from "@/lib/codex/backgroundAi";
import type { BackgroundInsert } from "@/types/background.types";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Background",
  entityRoute: (id) => `/backgrounds/${id}`,
  openPanel: () => {
    useGeneratorUiStore().backgroundGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface BackgroundGenerationOptions {
  /** A skill label the background should lean on, e.g. "Insight". */
  skill_focus?: string;
}

export function useBackgroundGeneration() {
  const { ruleset } = useTableRuleset();

  /** Returns a background row ready to insert (edition-shaped), or null on failure. */
  async function generate(
    userPrompt: string,
    options?: BackgroundGenerationOptions,
  ): Promise<BackgroundInsert | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    let context: ReturnType<typeof captureImageGenerationContext>;
    try {
      context = captureImageGenerationContext();
    } catch {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }

    try {
      const constraints: string[] = [];
      if (options?.skill_focus) constraints.push(`Skill focus: ${options.skill_focus}`);

      const result = await generateEntityText<BackgroundAiResult>({
        generator: "background",
        campaignId: context.campaignId,
        settingPrompt: context.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });

      return backgroundInsertFromAi(result, { ruleset: ruleset.value });
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
