import { buildCampaignContext } from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
import type { MonsterAiResult, MonsterAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider } from "./providers";
import { wrapUserInput } from "./utils";
import { logUsage } from "@/composables/useAiCredits";
import type { TextUsage } from "./providers/types";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";
import { buildAiProvenance } from "@/ai/provenance";

export interface MonsterGenerationOptions {
  challenge_rating?: string;
  monster_type?: string;
  size?: string;
  generateImage?: boolean;
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Monster",
  entityRoute: (id) => `/monsters/${id}`,
  openPanel: () => {
    useUiStore().monsterGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useMonsterGeneration() {
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: MonsterGenerationOptions,
  ): Promise<MonsterAiGenerated | null> {
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
      // ── 1. Generate stat block text ───────────────────────────────────
      const [basePrompt, rulesetContext] = await Promise.all([
        fetchSystemPrompt("monster"),
        fetchRulesetContext(ruleset.value),
      ]);
      if (!basePrompt) throw new Error("Monster system prompt not configured.");
      const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.challenge_rating) constraints.push(`Challenge Rating: ${options.challenge_rating}`);
      if (options?.monster_type) constraints.push(`Type: ${options.monster_type}`);
      if (options?.size) constraints.push(`Size: ${options.size}`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const result = JSON.parse(content) as MonsterAiResult;
      result.ai_provenance = buildAiProvenance("monster_generation", _textUsage.provider, _textUsage.model);

      // 2014 monster stat blocks never carry an initiative bonus — only 2024
      // separates initiative from the DEX modifier this way (#564).
      if (ruleset.value !== "2024") {
        delete result.stat_block.initiative_bonus;
      }

      // Honour explicit user overrides
      if (options?.challenge_rating) result.stat_block.challenge_rating = options.challenge_rating;
      if (options?.monster_type) result.monster_type = options.monster_type as MonsterAiResult["monster_type"];
      if (options?.size) result.size = options.size as MonsterAiResult["size"];

      // ── 2. Generate art (unless opted out) ───────────────────────────
      const wantImage = options?.generateImage !== false;
      let image_url: string | null = null;

      if (wantImage) {
        startAiQuotes("image");
        try {
          image_url = await generateImage({
            ...imageContext,
            purpose: "monster",
            subject: result.image_prompt,
          });
        } catch {
          // non-fatal
        }
      }

      logUsage({ reason: "monster_generation", textUsage });
      return { ...result, image_url };
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
