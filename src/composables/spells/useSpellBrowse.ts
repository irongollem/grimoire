import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCatalogueBrowse, useSettledSearch } from "@/composables/library/useCatalogueBrowse";
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
  /** Spell ids admitted by the class filter whatever their `classes` say: a subclass's expanded list. */
  extraIds?: readonly string[];
}

/** What `browse_spells` reports about the whole filtered result. Only the
 *  first page (offset 0) carries it. */
interface SpellBrowseSummary {
  total: number;
  selectable_ids: string[];
}

interface SpellBrowsePage extends Partial<SpellBrowseSummary> {
  rows: SpellBrowseRow[];
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
    p_extra_ids: f.extraIds && f.extraIds.length > 0 ? [...f.extraIds] : null,
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

  const search = useSettledSearch(() => toValue(filters).search);
  const effective = computed<SpellBrowseFilters>(() => ({ ...toValue(filters), search: search.value }));

  const browse = useCatalogueBrowse<SpellBrowseRow, SpellBrowsePage>({
    queryKey: () => {
      const f = effective.value;
      return [
        "spells", "browse", slugs.value, ruleset.value, campaign.activeCampaignId,
        f.search, f.level, f.school, f.class, f.source, f.extraIds ?? [],
      ] as const;
    },
    fetchPage: (offset) => {
      const s = slugs.value;
      if (s === null) throw new Error("useSpellBrowse fetched without enabled sources");
      return fetchPage(s, ruleset.value, campaign.activeCampaignId, effective.value, offset);
    },
    enabled: () => slugs.value !== null,
  });
  const { first } = browse;

  return {
    rows: browse.rows,
    total: computed(() => first.value?.total ?? 0),
    /** Own, non-shared rows matching the filters (whole result, not just loaded). */
    selectableIds: computed<string[]>(() => first.value?.selectable_ids ?? []),
    /** False while page 1 of the current filters is still loading. */
    ready: browse.ready,
    hasNextPage: browse.hasNextPage,
    isFetchingNextPage: browse.isFetchingNextPage,
    fetchNextPage: browse.fetchNextPage,
    isLoading: computed(() => browse.isLoading.value || slugs.value === null),
    error: browse.error,
  };
}
