import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { FactionAiResult, FactionAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider } from "./providers";
import { wrapUserInput } from "./utils";
import { logUsage } from "@/composables/ai/useAiCredits";
import type { TextUsage } from "./providers/types";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";
import { buildAiProvenance } from "@/ai/provenance";

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
    const settingPrompt = imageContext.settingPrompt;
    let textUsage: TextUsage | undefined;

    try {
      const textProvider = getTextProvider();

      const [basePrompt, rulesetContext] = await Promise.all([
        fetchSystemPrompt("faction"),
        fetchRulesetContext(ruleset.value),
      ]);
      if (!basePrompt) throw new Error("Faction system prompt not configured.");
      const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.faction_type)      constraints.push(`Faction Type: ${options.faction_type}`);
      if (options?.alignment)         constraints.push(`Alignment: ${options.alignment}`);
      if (options?.leader_name)       constraints.push(`Leader: ${options.leader_name}`);
      if (options?.headquarters_name) constraints.push(`Headquarters: ${options.headquarters_name}`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const factionData = JSON.parse(content) as FactionAiResult;
      factionData.ai_provenance = buildAiProvenance("faction_generation", _textUsage.provider, _textUsage.model);

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

      logUsage({ reason: "faction_generation", textUsage });
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
