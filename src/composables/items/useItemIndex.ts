import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useCampaignStore } from "@/stores/campaign";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { mergeLibraryWithCustom } from "@/lib/library/libraryShadow";
import type { ItemIndexEntry } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** Prefix must not start with "library-items": that root is persisted wholesale (#972). */
const LIBRARY_INDEX_KEY = "library-item-index";
// `cost` and `subtype` are shown in the store's add list and Card Forge.
const INDEX_COLUMNS =
  "id, name, item_type, subtype, rarity, cost, source, source_document_key, source_record_key, image_url, ruleset";
const CUSTOM_INDEX_COLUMNS = `${INDEX_COLUMNS}, campaign_id`;

type LibraryIndexRow = Omit<ItemIndexEntry, "is_shared" | "campaign_id">;
type CustomIndexRow = Omit<ItemIndexEntry, "is_shared">;

async function fetchLibraryIndex(enabledSlugs: string[], ruleset: RulesetKey): Promise<ItemIndexEntry[]> {
  // Same membership as fetchLibraryItems: edition-neutral bundled gear plus the enabled books.
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("library_items")
      .select(INDEX_COLUMNS)
      .in("source_document_key", ["grimoire-bundled", ...enabledSlugs])
      .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return (rows as LibraryIndexRow[]).map((row) => ({ ...row, is_shared: true, campaign_id: null }));
}

async function fetchCustomIndex(
  userId: string,
  campaignId: string | null,
  ruleset: RulesetKey,
): Promise<ItemIndexEntry[]> {
  // Scoped here rather than left to RLS (a ceiling, not a filter). The scope and
  // edition filters are the ones buildCatalogue applies to the browse list.
  let query = supabase.from("items").select(CUSTOM_INDEX_COLUMNS).eq("user_id", userId);
  query = campaignId === null ? query.is("campaign_id", null) : query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  const { data, error } = await query
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as CustomIndexRow[]).map((row) => ({ ...row, is_shared: false }));
}

/**
 * What an item picker may offer, slim: the same membership as `useItems().data`
 * (own rows of the table's edition in the active campaign scope, plus the library
 * rows the enabled books offer, an own row shadowing its library twin) without
 * loading the whole catalogue. Pick a row, then read it with `useItemsByIds`.
 *
 * Library art needs no `library_art_defaults` stamp here: `sync_library_item_art()`
 * bakes it into `library_items.image_url` server side.
 */
export function useItemIndex(getOptions?: () => { enabled?: boolean }) {
  const isEnabled = () => getOptions?.().enabled !== false;
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const { ruleset } = useTableRuleset();
  const { slugs: enabledSlugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_INDEX_KEY, enabledSlugs.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, slugs, rs] }) => {
      if (slugs === null) throw new Error("useItemIndex library fetch ran without enabled sources");
      return fetchLibraryIndex(slugs, rs);
    },
    enabled: () => isEnabled() && enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const customQuery = useQuery({
    queryKey: computed(() => ["items", "index", activeCampaignId.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, , campaignId, rs] }) => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      return fetchCustomIndex(user.id, campaignId, rs);
    },
    // Own rows only exist for a signed-in caller; never fire the read to fail it.
    enabled: () => isEnabled() && getCurrentUser() !== null,
    staleTime: Infinity,
  });

  const data = computed<ItemIndexEntry[] | undefined>(() => {
    const custom = customQuery.data.value;
    if (!custom) return undefined;
    return mergeLibraryWithCustom(libraryQuery.data.value ?? [], custom);
  });
  const isLoading = computed(
    () => customQuery.isLoading.value || sourcesLoading.value || libraryQuery.isLoading.value,
  );

  return { data, isLoading };
}
