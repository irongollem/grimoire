import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import type { LootTableAiResult } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import type { LootCrTier } from "@/types/lootTable.types";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _result = ref<LootTableAiResult | null>(null);

registerAiGenerator({
  ..._state,
  label: "Loot Table",
  entityRoute: (id) => `/loot-tables/${id}`,
  openPanel: () => {
    useUiStore().lootTableGeneratorOpen = true;
  },
});

export interface LootGenerationOptions {
  crTier: LootCrTier;
  excludeAttunement: boolean;
}

/**
 * AI loot-table generation (#602).
 *
 * SERVER-PATH ONLY — the one structural difference from every sibling
 * generator in this folder, and a deliberate one. The others carry a
 * client-side BYOK-local twin because they predate retrieval and had one
 * already; this generator was grounded from day one, and its whole value is a
 * candidate block built from `items`/`library_items` vectors that only the
 * edge function's service-role client can read. A local-key path would not be
 * a weaker version of this feature, it would be a different feature that
 * invents item names the DM's vault has never heard of. BYOK-local is a legacy
 * tier and not a parity target (see useQuestGeneration.ts) — so local-key mode
 * gets an honest error instead of a silent downgrade.
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
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";
      if (isLocalMode) {
        throw new Error(
          "Loot generation needs the server so it can search your Vault — it isn't available in local-key mode. " +
          "Switch to platform credits or a campaign API key in Settings → AI.",
        );
      }

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

      // The server bills credits itself as part of the retrieval+generation
      // call, so — unlike the client-side paths in sibling generators — there
      // is no logUsage() here.
      const result = data as LootTableAiResult;
      if (!Array.isArray(result.entries) || result.entries.length === 0) {
        throw new Error("AI returned no loot entries — please try again.");
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
