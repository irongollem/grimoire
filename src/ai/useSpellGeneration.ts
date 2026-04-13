import { useAuthStore } from "@/stores/auth";
import { BUCKETS, uploadToBucket } from "@/lib/storage";
import {
  SPELL_SYSTEM_PROMPT,
  IMAGE_BASE_PROMPT,
  buildCampaignContext,
} from "./prompts";
import type { SpellAiResult, SpellAiGenerated } from "./types";
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
import type { SpellSchool } from "@/types/spell.types";

export interface SpellGenerationOptions {
  /** Lock the spell level (0 = cantrip). AI fills the rest around it. */
  level?: number;
  /** Lock the school of magic. */
  school?: SpellSchool;
  /** Generate spell-effect art alongside the text. Defaults to true. */
  generateImage?: boolean;
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Spell",
  entityRoute: (id) => `/spells/${id}`,
  openPanel: () => {
    useUiStore().spellGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useSpellGeneration() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: SpellGenerationOptions,
  ): Promise<SpellAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();

      // ── 1. Generate spell text ────────────────────────────────────────
      const systemContent = `${SPELL_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.level !== undefined) {
        constraints.push(
          options.level === 0
            ? "Level: 0 (cantrip — no spell slot, no higher_levels scaling)"
            : `Level: ${options.level}`,
        );
      }
      if (options?.school) constraints.push(`School: ${options.school}`);

      const fullPrompt = constraints.length
        ? `${userPrompt}\n\n[Constraints — use exactly these values: ${constraints.join(", ")}]`
        : userPrompt;

      const result = JSON.parse(
        await textProvider.complete(systemContent, fullPrompt),
      ) as SpellAiResult;

      // Honour explicit overrides (in case the model drifts)
      if (options?.level !== undefined) result.level = options.level;
      if (options?.school) result.school = options.school;

      // Cantrips never have higher_levels text
      if (result.level === 0) result.higher_levels = null;

      // ── 2. Generate art (unless opted out) ────────────────────────────
      const wantImage = options?.generateImage !== false;
      let image_url: string | null = null;

      if (wantImage && result.image_prompt) {
        startAiQuotes("image");
        const imagePrompt = [IMAGE_BASE_PROMPT, result.image_prompt]
          .filter(Boolean)
          .join(" — ");

        const b64 = await imageProvider.generate(imagePrompt, "1024x1024");

        // ── 3. Upload to Supabase storage ───────────────────────────────
        // Spells get their own bucket (see migration 20260413000014) so the
        // DM can browse spell art in isolation later.
        if (b64 && auth.user) {
          image_url = await uploadToBucket(
            BUCKETS.spellImages,
            auth.user.id,
            b64ToBlob(b64),
          );
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
