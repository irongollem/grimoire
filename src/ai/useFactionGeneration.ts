import { generateEntityText } from "./entityTextGeneration";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { FactionAiResult, FactionAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Faction",
  entityRoute: (id) => `/factions/${id}`,
  openPanel: () => {
    useUiStore().factionGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface FactionGenerationOptions {
  faction_type?: string;
  alignment?: string;
  generateImage?: boolean;
  leader_name?: string;
  headquarters_name?: string;
}

export function useFactionGeneration() {
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: FactionGenerationOptions,
  ): Promise<FactionAiGenerated | null> {
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
      if (options?.faction_type)      constraints.push(`Faction Type: ${options.faction_type}`);
      if (options?.alignment)         constraints.push(`Alignment: ${options.alignment}`);
      if (options?.leader_name)       constraints.push(`Leader: ${options.leader_name}`);
      if (options?.headquarters_name) constraints.push(`Headquarters: ${options.headquarters_name}`);

      const factionData = await generateEntityText<FactionAiResult>({
        generator: "faction",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });

      // ── Emblem ─────────────────────────────────────────────────────────────
      let image_url: string | null = null;
      if (options?.generateImage !== false) {
        startAiQuotes("image");
        try {
          image_url = await generateImage({
            ...imageContext,
            purpose: "faction",
            subject: factionData.image_prompt,
          });
        } catch {
          // non-fatal
        }
      }

      return { ...factionData, image_url };
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
