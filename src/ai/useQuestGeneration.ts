import { ref } from "vue";
import { wrapUserInput } from "./utils";
import { QUEST_HOOKS_SYSTEM_PROMPT, buildCampaignContext, INJECTION_GUARD_SUFFIX } from "./prompts";
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

  async function generate(userPrompt: string): Promise<QuestHookResult[] | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _hooks.value = [];
    startAiQuotes();

    try {
      const textProvider = getTextProvider();
      const systemContent = `${QUEST_HOOKS_SYSTEM_PROMPT}${buildCampaignContext({
        setting: campaign.activeCampaign?.ai_setting_prompt ?? "",
      })}${INJECTION_GUARD_SUFFIX}`;

      const { content, usage: textUsage } = await textProvider.complete(
        systemContent,
        wrapUserInput(userPrompt),
      );
      const result = JSON.parse(content) as QuestHooksAiResult;

      if (!Array.isArray(result.hooks) || result.hooks.length === 0) {
        throw new Error("AI returned no quest hooks — please try again.");
      }

      logUsage({ reason: "quest_generation", textUsage });
      _hooks.value = result.hooks;
      return result.hooks;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
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
