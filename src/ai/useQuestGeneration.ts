import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { QuestHookResult, QuestHooksAiResult } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useAskUiStore } from "@/stores/ui/ask";
import { useCampaignStore } from "@/stores/campaign";
import type { AiProvenance } from "@/ai/provenance";


// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _provenance = ref<AiProvenance | null>(null);

registerAiGenerator({
  ..._state,
  label: "Quest",
  entityRoute: (id) => `/quests/${id}`,
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
  openPanel: () => {
    useAskUiStore().openPanel();
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useQuestGeneration() {
  const campaign = useCampaignStore();

  async function generate(userPrompt: string): Promise<QuestHookResult[] | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _provenance.value = null;
    startAiQuotes();

    try {
      const draft = await generateServerSide(userPrompt);

      _provenance.value = draft.ai_provenance ?? null;
      return draft.hooks;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  async function generateServerSide(userPrompt: string): Promise<QuestHooksAiResult> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) throw new Error("No active campaign selected.");

    const { data, error } = await supabase.functions.invoke("generate-quest", {
      body: {
        campaign_id: campaignId,
        prompt: userPrompt,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    if (!Array.isArray(data?.hooks) || data.hooks.length === 0) {
      throw new Error("AI returned no quest hooks. Please try again.");
    }

    // The server bills credits itself as part of the retrieval+generation call,
    // so there is no client-side usage log.
    return data as QuestHooksAiResult;
  }

  return {
    ..._state,
    provenance: _provenance,
    generate,
  };
}
