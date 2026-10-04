import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import type { MonsterIndexEntry } from "@/types/monster.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** Deliberately NOT prefixed "library-monsters": `useResolvedMonster` reads that
 *  prefix from the cache assuming full rows, and a slim row there crashed a page
 *  on `stat_block` (Sentry, 27 Sep 2026). */
const LIBRARY_INDEX_KEY = "library-monster-index";
/** Under the "monsters" root so every `invalidateQueries({ queryKey: ["monsters"] })`
 *  after a create, edit or delete reaches the index too. */
const CUSTOM_INDEX_KEY = ["monsters", "index"] as const;

/** What a picker or a name lookup shows: no stat block, no description. The
 *  challenge rating is lifted out of the stat block server-side, so the 2 MB
 *  bestiary does not travel to read one field of each row. */
const CUSTOM_INDEX_COLUMNS =
  "id, name, monster_type, size, source, image_url, campaign_id, challenge_rating:stat_block->>challenge_rating";

async function fetchLibraryIndex(slugs: string[], ruleset: RulesetKey): Promise<MonsterIndexEntry[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from("library_monsters")
    .select("id, name, monster_type, size, source, image_url, challenge_rating:stat_block->>challenge_rating")
    .in("source", slugs)
    .eq("ruleset", ruleset)
    .order("name", { ascending: true });
  if (error) throw error;
  // Shared rows belong to no campaign; which campaigns see them is decided by enabled sources.
  return data.map((row) => ({ ...row, campaign_id: null, is_shared: true }));
}

async function fetchCustomIndex(campaignId: string | null, ruleset: RulesetKey): Promise<MonsterIndexEntry[]> {
  const user = getCurrentUser();
  if (!user) throw new Error("useMonsterIndex read custom monsters without a signed-in user");
  // The same membership as `useAllMonsters` (open5e imports are legacy and come
  // from library_monsters now; a row with no ruleset fits both; the DM's globals
  // plus this campaign's own), expressed in the query so it filters rather than
  // downloads. `open5e_import` may be null on old rows, so "not true" is spelled out.
  let query = supabase
    .from("monsters")
    .select(CUSTOM_INDEX_COLUMNS)
    .eq("user_id", user.id)
    .or("open5e_import.is.null,open5e_import.eq.false")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`);
  query = campaignId
    ? query.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    : query.is("campaign_id", null);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({ ...row, is_shared: false }));
}

/** The picker / name-lookup list: the same members `useAllMonsters()` returns by
 *  default (enabled library sources at the table ruleset, plus this DM's custom
 *  monsters in the active campaign and their globals), as slim index rows. Library
 *  rows first, then custom, sorted by name, no dedupe — like `useAllMonsters`.
 *
 *  This is for choosing and for showing a name. A stored id (encounter combatant,
 *  companion, wild shape form) resolves through `useMonstersByIds`, which applies
 *  no scoping at all. */
export function useMonsterIndex(getOptions?: () => { enabled?: boolean }): {
  data: ComputedRef<MonsterIndexEntry[] | undefined>;
  isLoading: ComputedRef<boolean>;
} {
  const isEnabled = () => getOptions?.().enabled !== false;
  const { slugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();
  const { ruleset } = useTableRuleset();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_INDEX_KEY, slugs.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, sourceSlugs, rs] }) => {
      if (sourceSlugs === null) throw new Error("useMonsterIndex fetched without enabled sources");
      return fetchLibraryIndex(sourceSlugs, rs);
    },
    enabled: () => isEnabled() && slugs.value !== null,
    staleTime: Infinity,
  });

  const customQuery = useQuery({
    queryKey: computed(() => [...CUSTOM_INDEX_KEY, activeCampaignId.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, , campaignId, rs] }) => fetchCustomIndex(campaignId, rs),
    enabled: () => isEnabled() && getCurrentUser() !== null,
    staleTime: Infinity,
  });

  const data = computed<MonsterIndexEntry[] | undefined>(() => {
    const library = libraryQuery.data.value;
    const custom = customQuery.data.value;
    if (!library && !custom) return undefined;
    return [...(library ?? []), ...(custom ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  });

  const isLoading = computed(
    () => sourcesLoading.value || libraryQuery.isLoading.value || customQuery.isLoading.value,
  );
  return { data, isLoading };
}
