import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { EncounterAiResult } from "./types";
import { parseEncounterAiResult } from "@/lib/encounters/parseEncounterAiResult";
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
const _result = ref<EncounterAiResult | null>(null);

registerAiGenerator({
  ..._state,
  label: "Encounter",
  entityRoute: (id) => `/encounters/${id}`,
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
  openPanel: () => {
    useAskUiStore().openPanel();
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface EncounterGenerationOptions {
  /** "auto" | "easy" | "medium" | "hard" | "deadly" — the server/model resolves "auto". */
  difficulty: string;
  /** Lines the DM's world adds to the brief (what lives in the place the party is in), sent as constraints beside the difficulty. */
  constraints?: string[];
}

export function useEncounterGeneration() {
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options: EncounterGenerationOptions,
  ): Promise<EncounterAiResult | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _result.value = null;
    startAiQuotes();

    try {
      const result = await generateServerSide(userPrompt, options);

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
    options: EncounterGenerationOptions,
  ): Promise<EncounterAiResult> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) throw new Error("No active campaign selected.");

    const { data, error } = await supabase.functions.invoke("generate-encounter", {
      body: {
        campaign_id: campaignId,
        prompt: userPrompt,
        difficulty: options.difficulty,
        ...(options.constraints?.length ? { constraints: options.constraints } : {}),
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    const ai_provenance = (data as { ai_provenance?: AiProvenance })?.ai_provenance;
    return { ...parseEncounterAiResult(data), ai_provenance };
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
