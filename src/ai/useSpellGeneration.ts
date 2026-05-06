import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchImageBasePrompt } from "./systemPrompts";
import type { SpellAiResult, SpellAiGenerated } from "./types";
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
import type { SpellSchool } from "@/types/spell.types";
import { logUsage } from "@/composables/useAiCredits";
import type { TextUsage, ImageUsage } from "./providers/types";

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
    let textUsage: TextUsage | undefined;
    let imgUsage: ImageUsage | undefined;

    try {
      const textProvider = getTextProvider();
      // ── 1. Generate spell text ────────────────────────────────────────
      const [basePrompt, imageBasePrompt] = await Promise.all([
        fetchSystemPrompt("spell"),
        fetchImageBasePrompt(),
      ]);
      if (!basePrompt) throw new Error("Spell system prompt not configured.");
      const systemContent = `${basePrompt}${buildCampaignContext({
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

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const result = JSON.parse(content) as SpellAiResult;

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
        try {
          const imageProvider = getImageProvider();
          const imagePrompt = [imageBasePrompt, result.image_prompt]
            .filter(Boolean)
            .join(" — ");
          const { b64, usage: _imgUsage } = await imageProvider.generate(imagePrompt, "1024x1024");
          imgUsage = _imgUsage;
          if (b64 && auth.user) {
            image_url = await uploadWithVariants({ bucket: "spellImages", userId: auth.user.id, blob: b64ToBlob(b64) });
          }
        } catch {
          // non-fatal
        }
      }

      logUsage({ reason: "spell_generation", textUsage, imageUsage: imgUsage });
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
