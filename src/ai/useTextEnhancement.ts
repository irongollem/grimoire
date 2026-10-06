import { computed, ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import { AI_PROMPT_LIMIT_LONG } from "@edge-shared/ai-prompt.ts";
import { generateProseText } from "./entityTextGeneration";

/** generate-entity-text's bound on one constraint line. */
const MAX_CONSTRAINT_CHARS = 400;

/**
 * Whether Enhance is offered at all: DM tooling, on a campaign with AI on.
 * Deliberately cheap (two store reads), because every rich-text editor asks;
 * only an editor that answers yes mounts the bubble, and with it the credit
 * queries in `useTextEnhancement`.
 *
 * It used to require a key stored in the browser vault (#992), so a DM on
 * credits, which is nearly every DM, never saw the menu.
 */
export function useEnhanceAvailable() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  return computed(() => campaign.isAiEnabled && auth.isDM && campaign.activeCampaign !== null);
}

export interface EnhanceRequest {
  selectedText: string;
  /** What kind of text this is: "NPC backstory: Mira", "Scriptorium document". */
  context: string;
  /** House style to write in (the Scriptorium's per-document-type voice). */
  styleHint?: string;
  /** The words either side of the selection, for register only. */
  before?: string;
  after?: string;
}

function line(label: string, text: string): string {
  return `${label}: ${text}`.slice(0, MAX_CONSTRAINT_CHARS);
}

export function useTextEnhancement() {
  const isEnhancing = ref(false);
  const campaign = useCampaignStore();
  const { ruleset } = useTableRuleset();
  const { costOf } = useAiCredits();
  const { textMultiplierFor } = useProviderConfig();
  const { requireCredits } = useOutOfCredits();

  const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
  const textIsByok = computed(() => !!campaign.decryptedApiKey);
  const creditCost = computed(
    () => wholeCredits(costOf("text_enhancement") * textMultiplierFor(textProvider.value)),
  );

  /**
   * Rewrite the selection as D&D prose, charged like any other generation.
   * Resolves to the Markdown to put in its place, or null when the DM was
   * short of credits (the out-of-credits dialog is then already open).
   */
  async function enhance(request: EnhanceRequest): Promise<string | null> {
    const active = campaign.activeCampaign;
    if (!campaign.isAiEnabled || !active) throw new Error("AI is off for this campaign.");
    if (request.selectedText.length > AI_PROMPT_LIMIT_LONG) {
      throw new Error(`Select at most ${AI_PROMPT_LIMIT_LONG.toLocaleString()} characters to enhance.`);
    }
    if (!requireCredits(creditCost.value, textIsByok.value)) return null;

    const constraints = [line("Context", request.context)];
    if (request.styleHint) constraints.push(line("Writing style", request.styleHint));
    if (request.before?.trim()) constraints.push(line("Text before the selection", request.before.trim()));
    if (request.after?.trim()) constraints.push(line("Text after the selection", request.after.trim()));

    isEnhancing.value = true;
    try {
      return await generateProseText({
        generator: "text_enhancement",
        campaignId: active.id,
        settingPrompt: active.ai_setting_prompt,
        ruleset: ruleset.value,
        prompt: request.selectedText,
        constraints,
      });
    } finally {
      isEnhancing.value = false;
    }
  }

  return { isEnhancing, creditCost, enhance };
}
