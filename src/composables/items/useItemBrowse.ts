import { computed } from "vue";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import type { ItemScope } from "@/lib/items/itemScope";
import type { ItemBrowsePage } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** Rows per page; the Vault grid asks for the next one as the sentinel scrolls into view. */
export const ITEM_BROWSE_PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 250;

export interface ItemBrowseFilters {
  search: string;
  type: string;
  rarity: string;
  source: string;
  /** "" = everything usable in the active campaign. */
  scope: ItemScope | "";
}

interface BrowseArgs {
  slugs: string[];
  ruleset: RulesetKey;
  campaignId: string | null;
  filters: ItemBrowseFilters;
  offset: number;
}

/** An empty filter is "no filter" to the server, which takes null for it. */
function orNull(value: string): string | null {
  return value === "" ? null : value;
}

async function fetchItemBrowsePage(args: BrowseArgs): Promise<ItemBrowsePage> {
  const { filters } = args;
  const { data, error } = await supabase.rpc("browse_items", {
    p_slugs: args.slugs,
    p_ruleset: args.ruleset,
    p_campaign_id: args.campaignId,
    p_search: orNull(filters.search),
    p_type: orNull(filters.type),
    p_rarity: orNull(filters.rarity),
    p_source: orNull(filters.source),
    p_scope: orNull(filters.scope),
    p_limit: ITEM_BROWSE_PAGE_SIZE,
    p_offset: args.offset,
  });
  if (error) throw error;
  return data as ItemBrowsePage;
}

/**
 * The Vault's list (#972): one page of the merged item catalogue at a time,
 * filtered and merged on the server by `browse_items` instead of fetching
 * every item and filtering in the browser.
 *
 * The key starts `["items", "browse"]` so every item mutation's
 * `invalidateQueries(["items"])`, the live-sync invalidation and an
 * enabled-source change all reach it by prefix.
 */
export function useItemBrowse(getFilters: () => ItemBrowseFilters) {
  const { slugs } = useLibrarySourceSlugs();
  const { ruleset } = useTableRuleset();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const search = refDebounced(
    computed(() => getFilters().search.trim()),
    SEARCH_DEBOUNCE_MS,
  );
  const filters = computed<ItemBrowseFilters>(() => {
    const { type, rarity, source, scope } = getFilters();
    return { search: search.value, type, rarity, source, scope };
  });

  const query = useInfiniteQuery({
    queryKey: computed(
      () => [
        "items",
        "browse",
        slugs.value,
        ruleset.value,
        activeCampaignId.value,
        filters.value.search,
        filters.value.type,
        filters.value.rarity,
        filters.value.source,
        filters.value.scope,
      ] as const,
    ),
    queryFn: ({ pageParam }) => {
      if (slugs.value === null) throw new Error("useItemBrowse ran without enabled sources");
      return fetchItemBrowsePage({
        slugs: slugs.value,
        ruleset: ruleset.value,
        campaignId: activeCampaignId.value,
        filters: filters.value,
        offset: pageParam,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      const total = pages[0]?.total ?? 0;
      return loaded < total ? loaded : undefined;
    },
    enabled: () => slugs.value !== null,
    staleTime: Infinity,
    // A filter edit keeps the grid on screen until the new first page lands,
    // rather than flashing the spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  const pages = computed(() => query.data.value?.pages ?? []);
  const rows = computed(() => pages.value.flatMap((p) => p.rows));
  const first = computed(() => pages.value[0]);

  return {
    rows,
    total: computed(() => first.value?.total ?? 0),
    /** Every own row matching the filters, whichever page it is on (select-all). */
    selectableIds: computed(() => first.value?.selectable_ids ?? []),
    sources: computed(() => first.value?.sources ?? []),
    /** True once the current filters' first page is in, not a stand-in for the previous filters. */
    ready: computed(() => first.value !== undefined && !query.isPlaceholderData.value),
    isLoading: query.isPending,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
