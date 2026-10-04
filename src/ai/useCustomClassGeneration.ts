import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { captureImageGenerationContext } from "./useImageGeneration";
import {
  classDraftFromAi,
  type CasterProgression,
  type ClassAiResult,
  type ClassDraft,
} from "@/lib/codex/classAi";
import type { HitDie } from "@/levelup/customTypes";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Class",
  entityRoute: (id) => `/levelup/classes/${id}`,
  openPanel: () => {
    useUiStore().customClassGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface CustomClassGenerationOptions {
  hitDie?: HitDie;
  casterProgression?: CasterProgression;
}

export function useCustomClassGeneration() {
  const { ruleset } = useTableRuleset();

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
      const context = captureImageGenerationContext();
      const constraints: string[] = [];
      if (options?.hitDie) constraints.push(`Hit die: d${options.hitDie}`);
      if (options?.casterProgression) constraints.push(`Spellcasting progression (caster_progression): ${options.casterProgression}`);

      const raw = await generateEntityText<ClassAiResult>({
        generator: "custom_class",
        campaignId: context.campaignId,
        settingPrompt: context.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });
      // The DM's picks win over whatever the model wrote.
      const ai: ClassAiResult = {
        ...raw,
        ...(options?.hitDie ? { hit_die: options.hitDie } : {}),
        ...(options?.casterProgression ? { caster_progression: options.casterProgression } : {}),
      };
      const draft = classDraftFromAi(ai, { ruleset: ruleset.value, campaignId: context.campaignId });
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
