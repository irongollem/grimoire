import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";
import { normalizeDungeonFeature } from "@/lib/dungeonFeatures/featureAi";
import type { DungeonFeatureAiResult } from "@/lib/dungeonFeatures/featureAi";
import type { AiProvenance } from "./provenance";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Feature",
  entityRoute: (id) => `/dungeon-features/${id}`,
  openPanel: () => {
    useUiStore().dungeonFeatureGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface DungeonFeatureGenerationOptions {
  feature_type?: string;
  trigger_type?: string;
  generateImage?: boolean;
}

export interface DungeonFeatureAiGenerated extends DungeonFeatureAiResult {
  image_url: string | null;
}

export function useDungeonFeatureGeneration() {
  const { ruleset } = useTableRuleset();

  async function generate(
    userPrompt: string,
    options?: DungeonFeatureGenerationOptions,
  ): Promise<DungeonFeatureAiGenerated | null> {
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
      if (options?.feature_type) constraints.push(`Feature Type: ${options.feature_type}`);
      if (options?.trigger_type) constraints.push(`Trigger: ${options.trigger_type}`);

      const raw = await generateEntityText<Record<string, unknown> & { ai_provenance?: AiProvenance }>({
        generator: "feature",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });
      const feature = normalizeDungeonFeature(raw);

      let image_url: string | null = null;
      if (options?.generateImage !== false) {
        startAiQuotes("image");
        try {
          image_url = await generateImage({
            ...imageContext,
            purpose: "dungeon_feature",
            subject: feature.image_prompt,
          });
        } catch {
          // non-fatal
        }
      }

      return { ...feature, image_url };
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
