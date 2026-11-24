import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useAskUiStore } from "@/stores/ui/ask";
import { captureImageGenerationContext } from "./useImageGeneration";
import {
  classDraftFromAi,
  type CasterProgression,
  type ClassAiResult,
  type ClassDraft,
} from "@/lib/codex/classAi";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { findOfficialAsiFeature } from "@/lib/codex/asiFeature";
import type { HitDie } from "@/levelup/customTypes";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Class",
  entityRoute: (id) => `/levelup/classes/${id}`,
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
  openPanel: () => {
    useAskUiStore().openPanel();
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface CustomClassGenerationOptions {
  hitDie?: HitDie;
  casterProgression?: CasterProgression;
}

export function useCustomClassGeneration() {
  const { ruleset } = useTableRuleset();
  const { data: allFeatures, refetch: loadFeatures } = useAllFeatures();

  /**
   * Returns a class draft (class row plus the feature rows it points at), shaped
   * for the table's edition and structurally valid, or null on failure. Nothing is written.
   */
  async function generate(
    userPrompt: string,
    options?: CustomClassGenerationOptions,
  ): Promise<ClassDraft | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      const context = await captureImageGenerationContext();
      const constraints: string[] = [];
      if (options?.hitDie) constraints.push(`Hit die: d${options.hitDie}`);
      if (options?.casterProgression) constraints.push(`Spellcasting progression (caster_progression): ${options.casterProgression}`);

      const raw = await generateEntityText<ClassAiResult>({
        generator: "custom_class",
        campaignId: context.campaignId,
        prompt: userPrompt,
        constraints,
      });
      // The DM's picks win over whatever the model wrote.
      const ai: ClassAiResult = {
        ...raw,
        ...(options?.hitDie ? { hit_die: options.hitDie } : {}),
        ...(options?.casterProgression ? { caster_progression: options.casterProgression } : {}),
      };
      // The class grants the official Ability Score Improvement at its ASI levels; the
      // compendium may not be loaded yet when a DM opens the panel straight away.
      const features = allFeatures.value ?? (await loadFeatures()).data ?? [];
      const draft = classDraftFromAi(ai, {
        ruleset: ruleset.value,
        campaignId: context.campaignId,
        asiFeatureId: findOfficialAsiFeature(features, ruleset.value)?.id ?? null,
      });
      if (draft.problems.length) {
        throw new Error(`The model did not return a playable class (${draft.problems[0]}) Try again.`);
      }
      return draft;
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
