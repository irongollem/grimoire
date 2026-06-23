import { ref } from "vue";
import { wrapUserInput, buildCampaignContext } from "./utils";
import { fetchSystemPrompt } from "./systemPrompts";
import type { RollTableAiResult } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider } from "./providers";
import { useCampaignStore } from "@/stores/campaign";
import { logUsage } from "@/composables/useAiCredits";
import { ROLL_TABLE_DIE_MAX, validateEntryRanges } from "@/types/rollTable.types";
import type { RollTableDie, RollTableEntry } from "@/types/rollTable.types";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _result = ref<RollTableAiResult | null>(null);

registerAiGenerator({
  ..._state,
  label: "Roll Table",
  entityRoute: (id) => `/roll-tables/${id}`,
  openPanel: () => {
    useUiStore().rollTableGeneratorOpen = true;
  },
});

export interface RollTableGenerationOptions {
  die: RollTableDie;
}

export function useRollTableGeneration() {
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options: RollTableGenerationOptions,
  ): Promise<RollTableAiResult | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _result.value = null;
    startAiQuotes();

    try {
      const textProvider = getTextProvider();
      const basePrompt = await fetchSystemPrompt("roll_table");
      if (!basePrompt) throw new Error("Roll table system prompt not configured.");
      const systemContent = `${basePrompt}${buildCampaignContext({
        setting: campaign.activeCampaign?.ai_setting_prompt ?? "",
      })}`;

      const dieMax = ROLL_TABLE_DIE_MAX[options.die];
      const userContent =
        `${wrapUserInput(userPrompt)}\n\nConstraints:\n` +
        `Die: ${options.die}\n` +
        `Entries must cover the full range 1–${dieMax} with no gaps and no overlaps.`;

      const { content, usage: textUsage } = await textProvider.complete(
        systemContent,
        userContent,
      );
      const result = JSON.parse(content) as RollTableAiResult;

      if (!Array.isArray(result.entries) || result.entries.length === 0) {
        throw new Error("AI returned no table entries — please try again.");
      }

      // The model occasionally returns out-of-bounds or overlapping ranges;
      // surface a clean error so the DM can regenerate rather than saving a
      // table that fails range validation on create.
      const normalized: RollTableEntry[] = result.entries.map((e) => ({
        id: crypto.randomUUID(),
        min: e.min,
        max: e.max,
        label: e.label,
        encounter_id: null,
        notes: e.notes ?? null,
      }));
      const rangeError = validateEntryRanges(normalized, options.die);
      if (rangeError) throw new Error(`AI produced an invalid table (${rangeError}). Please try again.`);

      logUsage({ reason: "roll_table_generation", textUsage });
      _result.value = result;
      return result;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  function clearResult() {
    _result.value = null;
    _state.error.value = null;
  }

  return {
    ..._state,
    result: _result,
    generate,
    clearResult,
  };
}
