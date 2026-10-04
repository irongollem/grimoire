import { computed } from "vue";
import type { Ref } from "vue";
import { refDebounced } from "@vueuse/core";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

/** Matches `useGlobalSearch`: typing must pause before a search goes out. */
export const LOCATION_TEXT_SEARCH_DEBOUNCE_MS = 250;
export const LOCATION_TEXT_SEARCH_MIN_LENGTH = 2;

interface TextSearchAnswer {
  /** The term these ids answer; the data carries it so the two never separate. */
  term: string;
  ids: string[];
}

async function searchLocationText(campaignId: string, query: string): Promise<TextSearchAnswer> {
  const { data, error } = await supabase.rpc("search_campaign_location_text", {
    p_campaign_id: campaignId,
    p_query: query,
  });
  if (error) throw error;
  return { term: query, ids: data };
}

/**
 * Ids of the campaign's places whose description or notes contain `query`.
 *
 * The Atlas list no longer carries those columns (#972, story 15), so the text
 * match runs in the database and the client intersects the ids with the tree it
 * already holds. Name, tag and type matching stay client-side.
 *
 * While the next term loads the previous answer stays, and `matchedTerm` says
 * which term it answers, so the caller can compute its whole list against that
 * one term instead of mixing two.
 *
 * Keyed outside the `locations` root on purpose: results only need to be fresh
 * per query, and a `["locations", ...]` key would be picked up by the live-sync
 * reducer's prefix scan.
 */
export function useLocationTextSearch(query: Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const trimmed = computed(() => query.value.trim());
  const settled = refDebounced(trimmed, LOCATION_TEXT_SEARCH_DEBOUNCE_MS);

  const result = useQuery({
    queryKey: computed(() => ["location-text-search", campaignId.value, settled.value] as const),
    queryFn: ({ queryKey: [, cid, text] }) => {
      if (cid === null) throw new Error("useLocationTextSearch ran without an active campaign");
      return searchLocationText(cid, text);
    },
    enabled: () => !!campaignId.value && settled.value.length >= LOCATION_TEXT_SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const answer = computed(() =>
    settled.value.length >= LOCATION_TEXT_SEARCH_MIN_LENGTH ? (result.data.value ?? null) : null,
  );
  const matchedIds = computed(() => new Set(answer.value?.ids));
  const matchedTerm = computed(() => answer.value?.term ?? null);

  return { matchedIds, matchedTerm, isFetching: result.isFetching };
}
