import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { RollTableAiResult } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { validateEntryRanges } from "@/types/rollTable.types";
import type { RollTableDie, RollTableEntry } from "@/types/rollTable.types";


// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _result = ref<RollTableAiResult | null>(null);

registerAiGenerator({
  ..._state,
  label: "Roll Table",
  entityRoute: (id) => `/roll-tables/${id}`,
  openPanel: () => {
    useGeneratorUiStore().rollTableGeneratorOpen = true;
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
      const result = await generateServerSide(userPrompt, options);

      if (!Array.isArray(result.entries) || result.entries.length === 0) {
        throw new Error("AI returned no table entries. Please try again.");
      }

      // The model occasionally returns out-of-bounds or overlapping ranges;
      // surface a clean error so the DM can regenerate rather than saving a
      // table that fails range validation on create. The server deliberately
      // does not range-validate — this is the single validation point.
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

  async function generateServerSide(
    userPrompt: string,
    options: RollTableGenerationOptions,
  ): Promise<RollTableAiResult> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) throw new Error("No active campaign selected.");

    const { data, error } = await supabase.functions.invoke("generate-roll-table", {
      body: {
        campaign_id: campaignId,
        prompt: userPrompt,
        die: options.die,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    // The server bills credits itself as part of the retrieval+generation call,
    // so there is no client-side usage log.
    return data as RollTableAiResult;
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
