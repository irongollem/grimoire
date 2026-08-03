import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { wrapUserInput, buildCampaignContext } from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
import type { QuestHookResult, QuestHooksAiResult } from "./types";
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

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _hooks = ref<QuestHookResult[]>([]);

registerAiGenerator({
  ..._state,
  label: "Quest",
  entityRoute: (id) => `/quests/${id}`,
  openPanel: () => {
    useUiStore().questGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useQuestGeneration() {
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();

  async function generate(userPrompt: string): Promise<QuestHookResult[] | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _hooks.value = [];
    startAiQuotes();

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      const hooks = isLocalMode
        ? await generateClientSide(userPrompt)
        : await generateServerSide(userPrompt);

      _hooks.value = hooks;
      return hooks;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  async function generateServerSide(userPrompt: string): Promise<QuestHookResult[]> {
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
      throw new Error("AI returned no quest hooks — please try again.");
    }

    // The server bills credits itself as part of the retrieval+generation call,
    // so — unlike generateClientSide below — there is no client-side logUsage here.
    return data.hooks as QuestHookResult[];
  }

  async function generateClientSide(userPrompt: string): Promise<QuestHookResult[]> {
    const textProvider = getTextProvider();
    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("quest"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("Quest system prompt not configured.");
    const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
      setting: campaign.activeCampaign?.ai_setting_prompt ?? "",
    })}`;

    // The local (BYOK) path can't retrieve the DM's NPCs/locations/factions —
    // that's a DB read the edge function does with service-role access the
    // browser doesn't have. Hooks generated here simply come back without
    // npcs/locations/factions arrays. This parity gap is policy, not debt:
    // local-key mode exists for early adopters who didn't want to hand over an
    // API key, and it is not a target for new AI capabilities — the server
    // path is the product. Do not invest in closing this gap.
    const { content, usage: textUsage } = await textProvider.complete(
      systemContent,
      wrapUserInput(userPrompt),
    );
    const result = JSON.parse(content) as QuestHooksAiResult;

    if (!Array.isArray(result.hooks) || result.hooks.length === 0) {
      throw new Error("AI returned no quest hooks — please try again.");
    }

    logUsage({ reason: "quest_generation", textUsage });
    return result.hooks;
  }

  function clearHooks() {
    _hooks.value = [];
    _state.error.value = null;
  }

  return {
    ..._state,
    hooks: _hooks,
    generate,
    clearHooks,
  };
}
