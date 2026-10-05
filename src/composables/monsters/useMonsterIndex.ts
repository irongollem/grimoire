import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import type { MonsterIndexEntry } from "@/types/monster.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** Deliberately NOT prefixed "library-monsters": that prefix holds full rows
 *  (`useLibraryMonster`), and a slim row there crashed a page on `stat_block`
 *  (Sentry, 27 Sep 2026). */
const LIBRARY_INDEX_KEY = "library-monster-index";
/** Shape segment of the persisted library half: an entry written by an older build
 *  lacks the fields added since (#972), so a new shape starts a new key. */
const INDEX_SHAPE = "v2";
/** Under the "monsters" root so every `invalidateQueries({ queryKey: ["monsters"] })`
 *  after a create, edit or delete reaches the index too. */
const CUSTOM_INDEX_KEY = ["monsters", "index"] as const;

/** What a picker or a name lookup shows: no stat block, no description. The
 *  challenge rating is lifted out of the stat block server-side, so the 2 MB
 *  bestiary does not travel to read one field of each row. */
// `speed` decides wild shape eligibility (fly and swim limits) and
// `source_title` labels a version in the encounter generator; the cutout and
// focal point are the own side's token art (Token Forge). A library row has no
// cutout of its own (its art lives in the art tables).
const SHARED_INDEX_COLUMNS =
  "id, name, monster_type, size, source, source_title, image_url, portrait_focal_point, challenge_rating:stat_block->>challenge_rating, speed:stat_block->>speed";
const CUSTOM_INDEX_COLUMNS = `${SHARED_INDEX_COLUMNS}, campaign_id, cutout_url`;

type LibraryIndexRow = Omit<MonsterIndexEntry, "is_shared" | "campaign_id" | "cutout_url">;
type CustomIndexRow = Omit<MonsterIndexEntry, "is_shared">;

async function fetchLibraryIndex(slugs: string[], ruleset: RulesetKey): Promise<MonsterIndexEntry[]> {
  if (slugs.length === 0) return [];
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("library_monsters")
      .select(SHARED_INDEX_COLUMNS)
      .in("source", slugs)
      .eq("ruleset", ruleset)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  // Shared rows belong to no campaign; which campaigns see them is decided by enabled sources.
  return (rows as LibraryIndexRow[]).map((row) => ({ ...row, campaign_id: null, cutout_url: null, is_shared: true }));
}

async function fetchCustomIndex(campaignId: string | null, ruleset: RulesetKey): Promise<MonsterIndexEntry[]> {
  const user = getCurrentUser();
  if (!user) throw new Error("useMonsterIndex read custom monsters without a signed-in user");
  // Membership: open5e imports are legacy and come from library_monsters now; a
  // row with no ruleset fits both; the DM's globals plus this campaign's own.
  // Expressed in the query so it filters rather than downloads. `open5e_import` may be null on old rows, so "not true" is spelled out.
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
  return (data as CustomIndexRow[]).map((row) => ({ ...row, is_shared: false }));
}

/** The picker / name-lookup list: enabled library sources at the table ruleset,
 *  plus this DM's custom monsters in the active campaign and their globals, as
 *  slim index rows. Library rows first, then custom, sorted by name, no dedupe.
 *
 *  This is for choosing and for showing a name. A stored id (encounter combatant,
 *  companion, wild shape form) resolves through `useMonstersByIds`, which applies
 *  no scoping at all.
 *
 *  `sides: "library"` reads only the shared half. A player cannot read the
 *  `monsters` table (owner-only RLS), so a player surface that lists the whole
 *  bestiary takes the library half here and the custom monsters it may see from
 *  the player projection instead. */
export function useMonsterIndex(getOptions?: () => { enabled?: boolean; sides?: "both" | "library" }): {
  data: ComputedRef<MonsterIndexEntry[] | undefined>;
  isLoading: ComputedRef<boolean>;
} {
  const isEnabled = () => getOptions?.().enabled !== false;
  const { slugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();
  const { ruleset } = useTableRuleset();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_INDEX_KEY, INDEX_SHAPE, slugs.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, , sourceSlugs, rs] }) => {
      if (sourceSlugs === null) throw new Error("useMonsterIndex fetched without enabled sources");
      return fetchLibraryIndex(sourceSlugs, rs);
    },
    enabled: () => isEnabled() && slugs.value !== null,
    staleTime: Infinity,
  });

  const customQuery = useQuery({
    queryKey: computed(() => [...CUSTOM_INDEX_KEY, activeCampaignId.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, , campaignId, rs] }) => fetchCustomIndex(campaignId, rs),
    enabled: () => isEnabled() && getOptions?.().sides !== "library" && getCurrentUser() !== null,
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
