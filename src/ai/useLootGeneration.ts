import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { LootTableAiResult } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import type { LootCrTier } from "@/types/lootTable.types";


// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _result = ref<LootTableAiResult | null>(null);

registerAiGenerator({
  ..._state,
  label: "Loot Table",
  entityRoute: (id) => `/loot-tables/${id}`,
  openPanel: () => {
    useGeneratorUiStore().lootTableGeneratorOpen = true;
  },
});

export interface LootGenerationOptions {
  crTier: LootCrTier;
  excludeAttunement: boolean;
}

/**
 * AI loot-table generation (#602).
 *
 * Built on the server path: its whole value is a candidate block built from
 * `items`/`library_items` vectors that only the edge function's service-role
 * client can read.
 */
export function useLootGeneration() {
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options: LootGenerationOptions,
  ): Promise<LootTableAiResult | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _result.value = null;
    startAiQuotes();

    try {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("generate-loot", {
        body: {
          campaign_id: campaignId,
          prompt: userPrompt,
          cr_tier: options.crTier,
          exclude_attunement: options.excludeAttunement,
        },
      });

      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      // The server bills credits itself as part of the retrieval+generation call.
      const result = data as LootTableAiResult;
      if (!Array.isArray(result.entries) || result.entries.length === 0) {
        throw new Error("AI returned no loot entries. Please try again.");
      }

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
