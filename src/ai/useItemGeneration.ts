import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import { buildCampaignContext } from "./utils";
import { fetchSystemPrompt, fetchImageBasePrompt } from "./systemPrompts";
import type { ItemAiResult, ItemAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider, getImageProvider } from "./providers";
import { b64ToBlob, wrapUserInput } from "./utils";
import { useCampaignStore } from "@/stores/campaign";
import { logUsage } from "@/composables/useAiCredits";
import type { TextUsage, ImageUsage } from "./providers/types";

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
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: ItemGenerationOptions,
  ): Promise<ItemAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";
    let textUsage: TextUsage | undefined;
    let imgUsage: ImageUsage | undefined;

    try {
      const textProvider = getTextProvider();
      // ── 1. Generate item text ─────────────────────────────────────────────
      const [basePrompt, imageBasePrompt] = await Promise.all([
        fetchSystemPrompt("item"),
        fetchImageBasePrompt(),
      ]);
      if (!basePrompt) throw new Error("Item system prompt not configured.");
      const systemContent = `${basePrompt}${buildCampaignContext({
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

      // Merge game_benefits into description as a separate paragraph
      if (result.game_benefits) {
        result.description = `${result.description}\n\n${result.game_benefits}`;
      }

      // Honour explicit user overrides
      if (options?.item_type) result.item_type = options.item_type as ItemAiResult["item_type"];
      if (options?.rarity) result.rarity = options.rarity as ItemAiResult["rarity"];

      // ── 2. Generate art (unless opted out) ───────────────────────────────
      const wantImage = options?.generateImage !== false;
      let image_url: string | null = null;

      if (wantImage) {
        startAiQuotes("image");
        try {
          const imageProvider = getImageProvider();
          const imagePrompt = [imageBasePrompt, settingPrompt, result.image_prompt]
            .filter(Boolean)
            .join(" — ");
          const { b64, usage: _imgUsage } = await imageProvider.generate(imagePrompt, "1024x1536");
          imgUsage = _imgUsage;
          if (b64 && auth.user) {
            image_url = await uploadWithVariants({ bucket: "itemImages", userId: auth.user.id, blob: b64ToBlob(b64) });
          }
        } catch {
          // non-fatal
        }
      }

      logUsage({ reason: "item_generation", textUsage, imageUsage: imgUsage });
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
