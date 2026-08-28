import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { SpellAiResult, SpellAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider } from "./providers";
import { wrapUserInput } from "./utils";
import type { SpellSchool } from "@/types/spell.types";
import { logUsage } from "@/composables/ai/useAiCredits";
import type { TextUsage } from "./providers/types";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";
import { buildAiProvenance } from "@/ai/provenance";

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
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: SpellGenerationOptions,
  ): Promise<SpellAiGenerated | null> {
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
      // ── 1. Generate spell text ────────────────────────────────────────
      const [basePrompt, rulesetContext] = await Promise.all([
        fetchSystemPrompt("spell"),
        fetchRulesetContext(ruleset.value),
      ]);
      if (!basePrompt) throw new Error("Spell system prompt not configured.");
      const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
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
      result.ai_provenance = buildAiProvenance("spell_generation", _textUsage.provider, _textUsage.model);

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
          image_url = await generateImage({
            ...imageContext,
            purpose: "spell",
            subject: result.image_prompt,
          });
        } catch {
          // non-fatal
        }
      }

      logUsage({ reason: "spell_generation", textUsage });
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
