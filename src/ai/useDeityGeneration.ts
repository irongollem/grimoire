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
import {
  buildDeityConstraints,
  normalizeDeityResult,
  type DeityAiGenerated,
} from "@/lib/deities/deityAi";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Deity",
  entityRoute: (id) => `/deities/${id}`,
  openPanel: () => {
    useUiStore().deityGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface DeityGenerationOptions {
  pantheonName?: string;
  /** The deities the chosen pantheon already holds, so the new one fits and does not duplicate. */
  pantheonDeities?: ReadonlyArray<{ name: string; portfolio: string | null }>;
  alignment?: string;
  primaryDomain?: string;
  generateImage?: boolean;
}

export function useDeityGeneration() {
  const { ruleset } = useTableRuleset();

  async function generate(
    userPrompt: string,
    options?: DeityGenerationOptions,
  ): Promise<DeityAiGenerated | null> {
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
      const raw = await generateEntityText<Record<string, unknown>>({
        generator: "deity",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints: buildDeityConstraints({
          pantheonName: options?.pantheonName,
          pantheonDeities: options?.pantheonDeities,
          alignment: options?.alignment,
          primaryDomain: options?.primaryDomain,
        }),
      });
      const deity = normalizeDeityResult(raw);
      if (!deity.name) throw new Error("The model returned a deity without a name.");

      // ── Divine portrait ────────────────────────────────────────────────────
      let portrait_url: string | null = null;
      if (options?.generateImage !== false) {
        startAiQuotes("image");
        try {
          portrait_url = await generateImage({
            ...imageContext,
            purpose: "deity",
            subject: deity.image_prompt,
          });
        } catch {
          // non-fatal
        }
      }

      return { ...deity, portrait_url };
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
