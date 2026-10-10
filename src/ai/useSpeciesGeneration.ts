import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";
import { speciesInsertFromAi, type SpeciesAiResult } from "@/lib/codex/speciesAi";
import type { SpeciesInsert, SpeciesSize } from "@/types/species.types";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Species",
  entityRoute: (id) => `/species/${id}`,
  openPanel: () => {
    useGeneratorUiStore().speciesGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface SpeciesGenerationOptions {
  size?: SpeciesSize;
  generateImage?: boolean;
}

export function useSpeciesGeneration() {
  const { ruleset } = useTableRuleset();

  /** Returns a species row ready to insert (edition-shaped), or null on failure. */
  async function generate(
    userPrompt: string,
    options?: SpeciesGenerationOptions,
  ): Promise<SpeciesInsert | null> {
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
      if (options?.size) constraints.push(`Size: ${options.size}`);

      const result = await generateEntityText<SpeciesAiResult>({
        generator: "species",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });

      let image_url: string | null = null;
      if (options?.generateImage !== false && typeof result.image_prompt === "string" && result.image_prompt.trim()) {
        startAiQuotes("image");
        try {
          image_url = await generateImage({
            ...imageContext,
            purpose: "species",
            subject: result.image_prompt,
          });
        } catch {
          // non-fatal: the species is still created without art
        }
      }

      return speciesInsertFromAi(result, {
        ruleset: ruleset.value,
        campaignId: imageContext.campaignId,
        imageUrl: image_url,
      });
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
