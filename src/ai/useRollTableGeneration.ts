import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { wrapUserInput, buildCampaignContext } from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
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
import { buildAiProvenance } from "@/ai/provenance";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

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
  const { ruleset } = useRuleset();

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
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      const result = isLocalMode
        ? await generateClientSide(userPrompt, options)
        : await generateServerSide(userPrompt, options);

      if (!Array.isArray(result.entries) || result.entries.length === 0) {
        throw new Error("AI returned no table entries — please try again.");
      }

      // The model occasionally returns out-of-bounds or overlapping ranges;
      // surface a clean error so the DM can regenerate rather than saving a
      // table that fails range validation on create. The server deliberately
      // does not range-validate — this is the single validation point for
      // both generation paths.
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
    // so — unlike generateClientSide below — there is no client-side logUsage here.
    return data as RollTableAiResult;
  }

  async function generateClientSide(
    userPrompt: string,
    options: RollTableGenerationOptions,
  ): Promise<RollTableAiResult> {
    const textProvider = getTextProvider();
    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("roll_table"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("Roll table system prompt not configured.");
    const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
      setting: campaign.activeCampaign?.ai_setting_prompt ?? "",
    })}`;

    const dieMax = ROLL_TABLE_DIE_MAX[options.die];
    const userContent =
      `${wrapUserInput(userPrompt)}\n\nConstraints:\n` +
      `Die: ${options.die}\n` +
      `Entries must cover the full range 1–${dieMax} with no gaps and no overlaps.`;

    // The local (BYOK) path can't retrieve the DM's NPCs/locations/factions —
    // that's a DB read the edge function does with service-role access the
    // browser doesn't have. Tables generated here simply come back without
    // npcs/locations/factions arrays. This parity gap is policy, not debt:
    // local-key mode exists for early adopters who didn't want to hand over an
    // API key, and it is not a target for new AI capabilities — the server
    // path is the product. Do not invest in closing this gap.
    const { content, usage: textUsage } = await textProvider.complete(
      systemContent,
      userContent,
    );
    const result = JSON.parse(content) as RollTableAiResult;
    result.ai_provenance = buildAiProvenance("roll_table_generation", textUsage.provider, textUsage.model);

    logUsage({ reason: "roll_table_generation", textUsage });
    return result;
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
