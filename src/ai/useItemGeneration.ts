import { buildCampaignContext } from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { normalizeAiItemMastery } from "./itemMastery";
import { useRuleset } from "@/composables/useRuleset";
import type { ItemAiResult, ItemAiGenerated } from "./types";
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

export interface ItemGenerationOptions {
  item_type?: string;
  rarity?: string;
  cursed?: boolean;
  generateImage?: boolean;
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Item",
  entityRoute: (id) => `/vault/${id}`,
  openPanel: () => {
    useUiStore().itemGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useItemGeneration() {
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: ItemGenerationOptions,
  ): Promise<ItemAiGenerated | null> {
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
      // ── 1. Generate item text ─────────────────────────────────────────────
      const [basePrompt, rulesetContext] = await Promise.all([
        fetchSystemPrompt("item"),
        fetchRulesetContext(ruleset.value),
      ]);
      if (!basePrompt) throw new Error("Item system prompt not configured.");
      const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.item_type) constraints.push(`Item Type: ${options.item_type}`);
      if (options?.rarity) constraints.push(`Rarity: ${options.rarity}`);
      if (options?.cursed) constraints.push(`This item must be cursed — populate curse_description with the curse effect, trigger, and removal method`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const result = JSON.parse(content) as ItemAiResult;
      result.ai_provenance = buildAiProvenance("item_generation", _textUsage.provider, _textUsage.model);

      // Merge game_benefits into description as a separate paragraph
      if (result.game_benefits) {
        result.description = `${result.description}\n\n${result.game_benefits}`;
      }

      // Honour explicit user overrides
      if (options?.item_type) result.item_type = options.item_type as ItemAiResult["item_type"];
      if (options?.rarity) result.rarity = options.rarity as ItemAiResult["rarity"];

      // Weapon Mastery is a 2024-only weapon mechanic — normalize/strip otherwise (#564).
      result.mastery = normalizeAiItemMastery(result.mastery, {
        ruleset: ruleset.value,
        itemType: result.item_type,
      });

      // ── 2. Generate art (unless opted out) ───────────────────────────────
      const wantImage = options?.generateImage !== false;
      let image_url: string | null = null;

      if (wantImage) {
        startAiQuotes("image");
        try {
          image_url = await generateImage({
            ...imageContext,
            purpose: "item",
            subject: result.image_prompt,
          });
        } catch {
          // non-fatal
        }
      }

      logUsage({ reason: "item_generation", textUsage });
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
