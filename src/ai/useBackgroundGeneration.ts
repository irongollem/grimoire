import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { captureFailureMessage, captureImageGenerationContext } from "./useImageGeneration";
import { backgroundInsertFromAi, type BackgroundAiResult } from "@/lib/codex/backgroundAi";
import type { BackgroundInsert } from "@/types/background.types";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Background",
  entityRoute: (id) => `/backgrounds/${id}`,
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
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

    let context: Awaited<ReturnType<typeof captureImageGenerationContext>>;
    try {
      context = await captureImageGenerationContext();
    } catch (e) {
      _state.error.value = captureFailureMessage(e);
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
