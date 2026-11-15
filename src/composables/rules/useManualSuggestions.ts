/**
 * "Suggested pages" for the manual's search box (#1061).
 *
 * The substring search is the fast path. When it finds nothing and the DM has
 * typed a whole question, `search-manual` asks a judgment model which pages the
 * question is about. A request goes out only when ALL hold: the substring
 * search has no results, the trimmed query is at least `MIN_QUERY_LENGTH`
 * characters, the campaign has AI on, and typing has paused for `PAUSE_MS`.
 * One request per distinct query (the query is the cache key, so a newer query
 * supersedes an older one and its answer is never shown). A failure shows
 * nothing: the tab's own empty state stays.
 */
import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { useCampaignStore } from "@/stores/campaign";

export const MIN_QUERY_LENGTH = 8;
export const PAUSE_MS = 600;

export interface ManualPageRef {
  id: string;
  title: string;
  summary?: string;
}

/** Page ids the model suggested, best first; anything malformed is dropped. */
export function parseSuggestionIds(data: unknown): string[] {
  if (typeof data !== "object" || data === null || !("suggestions" in data) || !Array.isArray(data.suggestions)) {
    throw new Error("search-manual answered in an unexpected shape.");
  }
  const ids: string[] = [];
  for (const entry of data.suggestions as unknown[]) {
    if (typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string") ids.push(entry.id);
  }
  return ids;
}

export function useManualSuggestions(
  query: MaybeRefOrGetter<string>,
  pages: MaybeRefOrGetter<readonly ManualPageRef[]>,
  /** True while the substring search has results: the model is never asked then. */
  hasResults: MaybeRefOrGetter<boolean>,
) {
  const campaign = useCampaignStore();
  const trimmed = computed(() => toValue(query).trim());

  // The query the DM has stopped typing on; null until the pause has elapsed.
  const settled = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(
    trimmed,
    (value) => {
      clearTimeout(timer);
      settled.value = null;
      if (value.length < MIN_QUERY_LENGTH) return;
      timer = setTimeout(() => { settled.value = value; }, PAUSE_MS);
    },
    { immediate: true },
  );
  onScopeDispose(() => clearTimeout(timer));

  // Everything but the pause: with these false nothing is asked and nothing is waited for.
  const eligible = computed(
    () =>
      campaign.isAiEnabled &&
      campaign.activeCampaignId !== null &&
      trimmed.value.length >= MIN_QUERY_LENGTH &&
      !toValue(hasResults),
  );
  const asking = computed(() => eligible.value && settled.value === trimmed.value);

  const result = useQuery({
    queryKey: computed(() => ["manual-suggestions", campaign.activeCampaignId, settled.value] as const),
    enabled: asking,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const campaignId = campaign.activeCampaignId;
      const question = settled.value;
      if (campaignId === null || question === null) return [];
      const body = {
        campaignId,
        query: question,
        pages: toValue(pages).map(({ id, title, summary }) => ({ id, title, summary })),
      };
      const { data, error } = await supabase.functions.invoke("search-manual", { body });
      if (error) throw new Error(await edgeErrorMessage(error));
      return parseSuggestionIds(data);
    },
  });

  const suggestedIds = computed(() => (asking.value ? (result.data.value ?? []) : []));
  /** Typing has paused short of the wait, or the answer is on its way. */
  const isWaiting = computed(() => eligible.value && (!asking.value || result.isFetching.value));

  return { suggestedIds, isWaiting };
}
