/**
 * What one Monster Generator run costs in the active campaign, in credits.
 *
 * Four surfaces show this number — the generator panel itself, and the
 * document import's per-kind review, paste panel and wizard summary, where a
 * monster the page gave no stats for is generated rather than stubbed. Each had
 * grown its own copy of the same four lines of wiring; a price shown in four
 * places is exactly the thing that must not be re-derived per call site.
 */
import { computed, type ComputedRef } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { monsterGenerationCreditCost } from "@/lib/documentImport/monsterGenerationConcept";

/**
 * `campaigns.text_provider` is nullable, and every generation edge function
 * resolves null to OpenAI (`campaign.text_provider ?? "openai"` in each of
 * them). The price shown has to be priced the way the call will be billed, so
 * the client applies the same rule — this is the server's default, stated,
 * not a placeholder for a missing value.
 */
const SERVER_DEFAULT_TEXT_PROVIDER = "openai";

export function useMonsterGenerationCost(): { credits: ComputedRef<number> } {
  const campaign = useCampaignStore();
  const { costOf } = useAiCredits();
  const { textMultiplierFor } = useProviderConfig();

  const credits = computed(() => {
    const provider = campaign.activeCampaign?.text_provider ?? SERVER_DEFAULT_TEXT_PROVIDER;
    return monsterGenerationCreditCost(costOf("monster_stat_block"), textMultiplierFor(provider));
  });

  return { credits };
}
