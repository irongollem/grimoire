/**
 * What one Monster Generator run costs in the active campaign, in credits, for the text alone.
 *
 * Three surfaces show this number apart from the generator panel: the document import's per-kind review, paste panel
 * and wizard summary, where a monster the page gave no stats for is generated rather than stubbed. The price itself
 * is `useGeneratorQuote`'s, the one the generator panel and Ask Grimoire read, so no surface re-derives it.
 */
import { computed, type ComputedRef } from "vue";
import { useGeneratorQuote } from "@/composables/ai/useGeneratorQuote";

export function useMonsterGenerationCost(): { credits: ComputedRef<number | null> } {
  const { quoteFor } = useGeneratorQuote();

  const credits = computed(() => quoteFor("monster", { image: false }).total);

  return { credits };
}
