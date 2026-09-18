import { generateEntityText } from "./entityTextGeneration";
import { normalizeAiItemMastery } from "./itemMastery";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { ItemAiResult, ItemAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";

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

    try {
      const constraints: string[] = [];
      if (options?.item_type) constraints.push(`Item Type: ${options.item_type}`);
      if (options?.rarity) constraints.push(`Rarity: ${options.rarity}`);
      if (options?.cursed) constraints.push(`This item must be cursed — populate curse_description with the curse effect, trigger, and removal method`);

      const result = await generateEntityText<ItemAiResult>({
        generator: "item",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });

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
