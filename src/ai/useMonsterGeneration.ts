import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import { MONSTER_SYSTEM_PROMPT, IMAGE_BASE_PROMPT, buildCampaignContext } from "./prompts";
import type { MonsterAiResult, MonsterAiGenerated } from "./types";
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
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: MonsterGenerationOptions,
  ): Promise<MonsterAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();
      // ── 1. Generate stat block text ───────────────────────────────────
      const systemContent = `${MONSTER_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.challenge_rating) constraints.push(`Challenge Rating: ${options.challenge_rating}`);
      if (options?.monster_type) constraints.push(`Type: ${options.monster_type}`);
      if (options?.size) constraints.push(`Size: ${options.size}`);

      const fullPrompt = constraints.length
        ? `${userPrompt}\n\n[Constraints — use exactly these values in the stat block: ${constraints.join(", ")}]`
        : userPrompt;

      const result = JSON.parse(
        await textProvider.complete(systemContent, fullPrompt),
      ) as MonsterAiResult;

      // Honour explicit user overrides
      if (options?.challenge_rating) result.stat_block.challenge_rating = options.challenge_rating;
      if (options?.monster_type) result.monster_type = options.monster_type as MonsterAiResult["monster_type"];
      if (options?.size) result.size = options.size as MonsterAiResult["size"];

      // ── 2. Generate art (unless opted out) ───────────────────────────
      const wantImage = options?.generateImage !== false;
      let image_url: string | null = null;

      if (wantImage) {
        startAiQuotes("image");
        const imagePrompt = [IMAGE_BASE_PROMPT, settingPrompt, result.image_prompt]
          .filter(Boolean)
          .join(" — ");

        const b64 = await imageProvider.generate(imagePrompt, "1024x1024");

        // ── 3. Upload to Supabase storage ─────────────────────────────
        if (b64 && auth.user) {
          image_url = await uploadWithVariants({ bucket: "monsterImages", userId: auth.user.id, blob: b64ToBlob(b64) });
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
