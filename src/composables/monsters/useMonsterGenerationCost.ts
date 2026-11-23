/**
 * What one Monster Generator run costs in the active campaign, in credits, for the text alone.
 *
 * Three surfaces show this number apart from the generator panel: the document import's per-kind review, paste panel
 * and wizard summary, where a monster the page gave no stats for is generated rather than stubbed. The price itself
 * is `useMonsterQuote`'s, the one the generator panel and Ask Grimoire read, so no surface re-derives it.
 */
import { computed, type ComputedRef } from "vue";
import { useMonsterQuote } from "@/composables/ai/quotes/monsterQuote";

export function useMonsterGenerationCost(): { credits: ComputedRef<number | null> } {
  const quoteFor = useMonsterQuote();

  const credits = computed(() => quoteFor({ image: false }).total);

  return { credits };
}
