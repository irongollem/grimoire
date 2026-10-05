import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import type { SpellIndexEntry } from "@/types/spell.types";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useCampaignStore } from "@/stores/campaign";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

// Must NOT start with "library-spells": that prefix holds full rows (`useLibrarySpell`).
const LIBRARY_INDEX_KEY = "library-spell-index";
/** Shape segment of the persisted library half: an entry written by an older build
 *  lacks the fields added since (#972), so a new shape starts a new key. */
const INDEX_SHAPE = "v2";

const LIBRARY_COLUMNS = "id, name, level, school, concentration, source, classes";
const CUSTOM_COLUMNS = "id, name, level, school, concentration, source, classes, campaign_id";
const PAGE = 1000;

type LibraryRow = Omit<SpellIndexEntry, "is_shared" | "campaign_id">;
type CustomRow = Omit<SpellIndexEntry, "is_shared">;

async function fetchLibrarySpellIndex(slugs: string[], ruleset: RulesetKey): Promise<SpellIndexEntry[]> {
  if (slugs.length === 0) return [];
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("library_spells")
      .select(LIBRARY_COLUMNS)
      .in("source", slugs)
      .eq("ruleset", ruleset)
      .order("level", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return (rows as LibraryRow[]).map((row) => ({ ...row, is_shared: true, campaign_id: null }));
}

/**
 * Custom spells visible to the caller, scoped by campaign only. There is
 * deliberately NO user_id filter: `spells_select` lets a player read the custom
 * spells of a DM they share a campaign with, and that is how a player's picker
 * shows the DM's homebrew today. Open5e imports are legacy (they now come from
 * library_spells) and a null ruleset means "any ruleset".
 */
async function fetchCustomSpellIndex(campaignId: string | null, ruleset: RulesetKey): Promise<SpellIndexEntry[]> {
  const all: SpellIndexEntry[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("spells")
      .select(CUSTOM_COLUMNS)
      .eq("open5e_import", false)
      .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
      .or(campaignId ? `campaign_id.is.null,campaign_id.eq.${campaignId}` : "campaign_id.is.null")
      .order("level", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data as CustomRow[];
    all.push(...rows.map((row) => ({ ...row, is_shared: false })));
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Enabled library sources plus custom spells, sorted level then name, without the descriptions. A row opens in
 *  full through `useSpellsByIds`. */
export function useSpellIndex(getOptions?: () => { enabled?: boolean }) {
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();
  const { slugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();
  const on = () => getOptions?.().enabled !== false;

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_INDEX_KEY, INDEX_SHAPE, slugs.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, , enabledSlugs, activeRuleset] }) => {
      if (enabledSlugs === null) throw new Error("useSpellIndex fetched without enabled sources");
      return fetchLibrarySpellIndex(enabledSlugs, activeRuleset);
    },
    enabled: () => on() && slugs.value !== null,
    staleTime: Infinity,
  });

  const customQuery = useQuery({
    queryKey: computed(() => ["spells", "index", campaign.activeCampaignId, ruleset.value] as const),
    queryFn: ({ queryKey: [, , campaignId, activeRuleset] }) => fetchCustomSpellIndex(campaignId, activeRuleset),
    enabled: on,
    staleTime: Infinity,
  });

  const data = computed<SpellIndexEntry[] | undefined>(() => {
    if (!on()) return undefined;
    if (libraryQuery.data.value === undefined && customQuery.data.value === undefined) return undefined;
    return [...(libraryQuery.data.value ?? []), ...(customQuery.data.value ?? [])]
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });

  const isLoading = computed(
    () => on() && (customQuery.isLoading.value || sourcesLoading.value || libraryQuery.isLoading.value),
  );

  return { data, isLoading };
}
