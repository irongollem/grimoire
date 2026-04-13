import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { ITEM_SYSTEM_PROMPT, IMAGE_BASE_PROMPT, buildCampaignContext } from "./prompts";
import type { ItemAiResult, ItemAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider, getImageProvider } from "./providers";
import { b64ToBlob } from "./utils";
import { useCampaignStore } from "@/stores/campaign";

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

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();
      // ── 1. Generate item text ─────────────────────────────────────────────
      const systemContent = `${ITEM_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.item_type) constraints.push(`Item Type: ${options.item_type}`);
      if (options?.rarity) constraints.push(`Rarity: ${options.rarity}`);
      if (options?.cursed) constraints.push(`This item must be cursed — populate curse_description with the curse effect, trigger, and removal method`);

      const fullPrompt = constraints.length
        ? `${userPrompt}\n\n[Constraints — use exactly these values: ${constraints.join(", ")}]`
        : userPrompt;

      const result = JSON.parse(
        await textProvider.complete(systemContent, fullPrompt),
      ) as ItemAiResult;

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
        const imagePrompt = [IMAGE_BASE_PROMPT, settingPrompt, result.image_prompt]
          .filter(Boolean)
          .join(" — ");

        const b64 = await imageProvider.generate(imagePrompt, "1024x1536");

        // ── 3. Upload to Supabase storage ─────────────────────────────────
        if (b64 && auth.user) {
          const blob = b64ToBlob(b64);
          const path = `${auth.user.id}/${crypto.randomUUID()}.webp`;
          const { error: uploadErr } = await supabase.storage
            .from("asset-images")
            .upload(path, blob, { contentType: "image/webp" });
          if (!uploadErr) {
            image_url = supabase.storage.from("asset-images").getPublicUrl(path).data.publicUrl;
          }
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
