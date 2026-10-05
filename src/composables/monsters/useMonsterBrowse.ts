import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useQuota } from "@/composables/billing/useQuota";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useCatalogueBrowse, useSettledSearch } from "@/composables/library/useCatalogueBrowse";
import type { MonsterBrowseRow } from "@/types/monster.types";

export const MONSTER_BROWSE_PAGE_SIZE = 48;

export interface MonsterBrowseFilters {
  search: string;
  /** "all" | "custom" | a library source slug. */
  source: string;
  /** "all" | a creature type. */
  type: string;
}

/** What `browse_monsters` reports about the whole filtered result. Only the
 *  first page (offset 0) carries it. */
interface MonsterBrowseSummary {
  total: number;
  scope_total: number;
  selectable_ids: string[];
  locked_ids: string[];
}

interface MonsterBrowsePage extends Partial<MonsterBrowseSummary> {
  rows: MonsterBrowseRow[];
}

async function fetchPage(
  slugs: string[],
  ruleset: string,
  campaignId: string | null,
  f: MonsterBrowseFilters,
  lockCount: number,
  offset: number,
): Promise<MonsterBrowsePage> {
  const search = f.search.trim();
  const { data, error } = await supabase.rpc("browse_monsters", {
    p_slugs: slugs,
    p_ruleset: ruleset,
    p_campaign_id: campaignId,
    p_search: search === "" ? null : search,
    p_source: f.source,
    p_type: f.type === "all" ? null : f.type,
    p_limit: MONSTER_BROWSE_PAGE_SIZE,
    p_offset: offset,
    p_lock_count: lockCount,
  });
  if (error) throw error;
  return data as unknown as MonsterBrowsePage;
}

/**
 * The Bestiary page, one server page at a time (#972). Membership, order,
 * filters, counts and the quota lock live in `browse_monsters`; this only asks
 * for the next 48. Keyed under `["monsters"]` so every monster mutation
 * reaches it. The quota lock count comes from `useQuota` here, so every caller
 * shares one key. Never write these slim rows under `library-monsters`, which
 * holds full rows.
 */
export function useMonsterBrowse(filters: MaybeRefOrGetter<MonsterBrowseFilters>) {
  const campaign = useCampaignStore();
  const { ruleset } = useTableRuleset();
  const { slugs } = useLibrarySourceSlugs();
  const { quota } = useQuota("monsters");
  // How many of the newest own monsters the plan no longer covers.
  const lockCount = computed(() => {
    const q = quota.value;
    return !q || q.unlimited ? 0 : Math.max(0, q.current - q.limit);
  });
  const search = useSettledSearch(() => toValue(filters).search);

  const effective = computed<MonsterBrowseFilters>(() => {
    const f = toValue(filters);
    return { search: search.value, source: f.source, type: f.type };
  });

  const browse = useCatalogueBrowse<MonsterBrowseRow, MonsterBrowsePage>({
    queryKey: () => {
      const f = effective.value;
      return [
        "monsters", "browse", slugs.value, ruleset.value, campaign.activeCampaignId,
        f.search, f.source, f.type, lockCount.value,
      ] as const;
    },
    fetchPage: (offset) => {
      const s = slugs.value;
      if (s === null) throw new Error("useMonsterBrowse fetched without enabled sources");
      return fetchPage(
        s, ruleset.value, campaign.activeCampaignId, effective.value, lockCount.value, offset,
      );
    },
    enabled: () => slugs.value !== null,
  });
  const { first } = browse;

  return {
    rows: browse.rows,
    /** Rows matching the filters. */
    total: computed(() => first.value?.total ?? 0),
    /** The whole scoped catalogue, filters aside. */
    scopeTotal: computed(() => first.value?.scope_total ?? 0),
    /** Every own row matching the filters (select-all), not just the loaded pages. */
    selectableIds: computed<string[]>(() => first.value?.selectable_ids ?? []),
    /** The newest own monsters over the plan's quota. */
    lockedIds: computed<string[]>(() => first.value?.locked_ids ?? []),
    /** False while page 1 of the current filters is still loading. */
    ready: browse.ready,
    hasNextPage: browse.hasNextPage,
    isFetchingNextPage: browse.isFetchingNextPage,
    fetchNextPage: browse.fetchNextPage,
    isLoading: computed(() => browse.isLoading.value || slugs.value === null),
    error: browse.error,
  };
}
