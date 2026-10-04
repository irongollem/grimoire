import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { captureImageGenerationContext } from "./useImageGeneration";
import type { AiProvenance } from "./provenance";
import { AI_PROMPT_LIMIT } from "./utils";
import { buildBeatFillConstraints, normalizeBeatFill, type BeatFill, type BeatFillContext } from "@/lib/quests/beatFill";

/** What `generate-entity-text` returns for the `quest_beat` key. */
export interface QuestBeatFillResult {
  title: string;
  read_aloud: string;
  dm_content: string;
  ai_provenance?: AiProvenance;
}

export interface QuestBeatFilled {
  fill: BeatFill;
  provenance: AiProvenance | null;
}

// ── Module-level singleton state ────────────────────────────────────────────
// A fill happens in place on the beat page, so there is no panel to reopen and
// no created entity to link to; the registration only lets the background
// badge show that a fill is running while the DM navigates.
const _state = createAiGenerationState();
let lastQuestId = "";

registerAiGenerator({
  ..._state,
  label: "Beat",
  entityRoute: (beatId) => `/quests/${lastQuestId}/beats/${beatId}`,
  openPanel: () => {},
});

const DEFAULT_STEER = "Fill in this beat so it continues the quest's flow.";

export function useQuestBeatFill() {
  const { ruleset } = useTableRuleset();

  async function generate(
    questId: string,
    context: BeatFillContext,
    steer?: string,
  ): Promise<QuestBeatFilled | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    lastQuestId = questId;
    startAiQuotes();

    try {
      const imageContext = captureImageGenerationContext();
      const raw = await generateEntityText<QuestBeatFillResult>({
        generator: "quest_beat",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: steer?.trim().slice(0, AI_PROMPT_LIMIT) || DEFAULT_STEER,
        constraints: buildBeatFillConstraints(context),
      });
      return { fill: normalizeBeatFill(raw), provenance: raw.ai_provenance ?? null };
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
