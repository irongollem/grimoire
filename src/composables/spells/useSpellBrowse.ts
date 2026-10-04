import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import type { SpellBrowseRow } from "@/types/spell.types";

export const SPELL_BROWSE_PAGE_SIZE = 48;

export interface SpellBrowseFilters {
  search: string;
  /** "" = all, "0".."9". */
  level: string;
  school: string;
  class: string;
  /** "all" | "custom" | a library source slug. */
  source: string;
}

interface SpellBrowsePage {
  rows: SpellBrowseRow[];
  total: number;
  selectable_ids: string[];
}

async function fetchPage(
  slugs: string[],
  ruleset: string,
  campaignId: string | null,
  f: SpellBrowseFilters,
  offset: number,
): Promise<SpellBrowsePage> {
  const search = f.search.trim();
  const { data, error } = await supabase.rpc("browse_spells", {
    p_slugs: slugs,
    p_ruleset: ruleset,
    p_campaign_id: campaignId,
    p_search: search === "" ? null : search,
    p_level: f.level === "" ? null : parseInt(f.level, 10),
    p_school: f.school === "" ? null : f.school,
    p_class: f.class === "" ? null : f.class,
    p_source: f.source === "" ? "all" : f.source,
    p_limit: SPELL_BROWSE_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw error;
  return data as unknown as SpellBrowsePage;
}

/**
 * The Spellbook page, one server page at a time (#972). Membership, order and
 * filters live in `browse_spells`; this only asks for the next 48. Keyed under
 * `["spells"]` so every spell mutation reaches it.
 */
export function useSpellBrowse(filters: MaybeRefOrGetter<SpellBrowseFilters>) {
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();
  const { slugs } = useLibrarySourceSlugs();

  const query = useInfiniteQuery({
    queryKey: computed(() => {
      const f = toValue(filters);
      return [
        "spells", "browse", slugs.value, ruleset.value, campaign.activeCampaignId,
        f.search.trim(), f.level, f.school, f.class, f.source,
      ] as const;
    }),
    queryFn: ({ pageParam }) => {
      const s = slugs.value;
      if (s === null) throw new Error("useSpellBrowse fetched without enabled sources");
      return fetchPage(s, ruleset.value, campaign.activeCampaignId, toValue(filters), pageParam);
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total && last.rows.length > 0 ? loaded : undefined;
    },
    enabled: () => slugs.value !== null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });

  const rows = computed<SpellBrowseRow[]>(() => query.data.value?.pages.flatMap((p) => p.rows) ?? []);
  const total = computed(() => query.data.value?.pages[0]?.total ?? 0);
  /** Own, non-shared rows matching the filters (whole result, not just loaded). */
  const selectableIds = computed<string[]>(() => query.data.value?.pages[0]?.selectable_ids ?? []);
  /** False while page 1 of the current filters is still loading. */
  const ready = computed(() => query.data.value !== undefined && !query.isPlaceholderData.value);

  return {
    rows,
    total,
    selectableIds,
    ready,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => query.fetchNextPage(),
    isLoading: computed(() => query.isLoading.value || slugs.value === null),
    error: query.error,
  };
}
