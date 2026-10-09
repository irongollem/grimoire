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
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

export function useMonsterGenerationCost(): { credits: ComputedRef<number | null> } {
  const { costOf } = useAiCredits();
  const { textCredits } = useCampaignProviders();

  const credits = computed(() => textCredits(costOf("monster_stat_block")));

  return { credits };
}
