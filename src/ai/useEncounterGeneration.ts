import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { buildCampaignContext, wrapUserInput } from "./utils";
import type { EncounterAiResult } from "./types";
import { parseEncounterAiResult } from "@/lib/encounters/parseEncounterAiResult";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider } from "./providers";
import { logUsage } from "@/composables/ai/useAiCredits";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import { buildAiProvenance, type AiProvenance } from "@/ai/provenance";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _result = ref<EncounterAiResult | null>(null);

registerAiGenerator({
  ..._state,
  label: "Encounter",
  entityRoute: (id) => `/encounters/${id}`,
  openPanel: () => {
    useUiStore().encounterGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface EncounterGenerationOptions {
  /** "auto" | "easy" | "medium" | "hard" | "deadly" — the server/model resolves "auto". */
  difficulty: string;
}

export function useEncounterGeneration() {
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();

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
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      const result = isLocalMode
        ? await generateClientSide(userPrompt, options)
        : await generateServerSide(userPrompt, options);

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
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    const ai_provenance = (data as { ai_provenance?: AiProvenance })?.ai_provenance;
    return { ...parseEncounterAiResult(data), ai_provenance };
  }

  async function generateClientSide(
    userPrompt: string,
    options: EncounterGenerationOptions,
  ): Promise<EncounterAiResult> {
    const textProvider = getTextProvider();

    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("encounter"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("Encounter system prompt not configured.");

    const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
      setting: campaign.activeCampaign?.ai_setting_prompt,
    })}`;

    // The local (BYOK) path can't build the server's party summary or custom-
    // monster index — those come from DB reads the edge function does with
    // service-role access that the browser doesn't have. We pass only the
    // difficulty constraint and let the model work from campaign context
    // alone; this is a deliberate parity gap with the server path, not an
    // oversight.
    const userContent =
      `${wrapUserInput(userPrompt)}\n\nConstraints:\n` + `Difficulty: ${options.difficulty}`;

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);

    // parseEncounterAiResult validates the *shape* but is handed an already-
    // parsed value, so the parse itself needs its own guard: a fenced or
    // truncated response would otherwise surface a raw SyntaxError
    // ("Unexpected token ... in JSON") to the DM. The edge function guards its
    // own parse the same way — this is the local path's equivalent.
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error("AI returned malformed encounter data — please try again.");
    }
    const result = parseEncounterAiResult(raw);

    logUsage({ reason: "encounter_generation", textUsage });
    const ai_provenance = buildAiProvenance("encounter_generation", textUsage.provider, textUsage.model);
    return { ...result, ai_provenance };
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
