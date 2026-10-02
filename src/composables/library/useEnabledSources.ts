import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useContentScope, useRuleset, useTableRuleset } from "@/composables/rules/useRuleset";

const ENABLED_KEY          = "enabled-sources";
const USER_ENABLED_KEY     = "user-enabled-sources";
const AVAILABLE_PLAYER_KEY = "available-player-books";
const AVAILABLE_KEY        = "available-library-sources";
const AVAILABLE_SPELL_KEY  = "available-library-spell-sources";
const AVAILABLE_ITEM_KEY   = "available-library-item-sources";
const AVAILABLE_SPECIES_KEY = "available-library-species-sources";

export interface EnabledSource {
  id: string;
  campaign_id: string;
  source_slug: string;
  source_title: string | null;
  enabled_at: string;
}

/** One additional book a player turned on for their table-less characters. The SRDs are never stored here. */
export interface UserEnabledSource {
  id: string;
  user_id: string;
  source_slug: string;
  source_title: string | null;
  enabled_at: string;
}

export interface AvailableLibrarySource {
  source: string;       // slug, e.g. "wotc-srd"
  source_title: string | null;
  count: number;
}

async function fetchEnabledSources(campaignId: string): Promise<EnabledSource[]> {
  const { data, error } = await supabase
    .from("campaign_enabled_sources")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("source_title", { ascending: true });
  if (error) throw error;
  return data as EnabledSource[];
}

async function fetchAvailableLibrarySources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_monster_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

async function enableSource(campaignId: string, source_slug: string, source_title: string | null): Promise<void> {
  const { error } = await supabase
    .from("campaign_enabled_sources")
    .insert({ campaign_id: campaignId, source_slug, source_title });
  if (error) throw error;
}

async function disableSource(campaignId: string, source_slug: string): Promise<void> {
  const { error } = await supabase
    .from("campaign_enabled_sources")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("source_slug", source_slug);
  if (error) throw error;
}

export function useEnabledSources() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [ENABLED_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useEnabledSources fetched without a campaign");
      return fetchEnabledSources(cid);
    },
    enabled: () => !!campaignId.value,
  });
}

/**
 * The SRD baseline a user reads when what they are building has no table. A
 * character carries its own edition (#943), so a table-less 2024 character needs
 * the 2024 SRD as much as a 2014 one needs the 2014 SRD. Every library fetch
 * filters on `ruleset` server-side, so listing both lets the character's own
 * edition pick the one it reads. Always on for a player, so never stored in
 * `user_enabled_sources`.
 */
export const STANDALONE_LIBRARY_SLUGS: readonly string[] = ["srd-2014", "srd-2024"];

async function fetchUserEnabledSources(userId: string): Promise<UserEnabledSource[]> {
  // Scoped to the caller in the query: RLS is a ceiling, not a filter.
  const { data, error } = await supabase
    .from("user_enabled_sources")
    .select("*")
    .eq("user_id", userId)
    .order("source_title", { ascending: true });
  if (error) throw error;
  return data as UserEnabledSource[];
}

/** The additional books the signed-in player enabled (the SRDs are not rows). */
export function useUserEnabledSources() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  return useQuery({
    queryKey: computed(() => [USER_ENABLED_KEY, userId.value] as const),
    queryFn: ({ queryKey: [, uid] }) => {
      if (uid === null) throw new Error("useUserEnabledSources fetched without a user");
      return fetchUserEnabledSources(uid);
    },
    enabled: () => !!userId.value,
  });
}

/**
 * Which library sources a shared-content query should read. Decided by the
 * scope's `standalone` flag, not by whether a campaign happens to be open: a
 * table-less character viewed from inside a campaign still reads its player's
 * books, and a character at a table reads that table's.
 *
 * - standalone: the SRDs plus the player's own enabled books.
 * - otherwise: the active campaign's enabled sources.
 *
 * **`null` means "not known yet" and is load-bearing.** Callers gate their
 * library query on `enabled: () => slugs.value !== null`; returning `[]` while
 * the enabled-source rows are still in flight would fire a query that matches
 * nothing and cache the empty result.
 *
 * The standalone branch exists because `useEnabledSources` is *disabled*
 * without a campaign, so its data stays `undefined` forever and the slug list
 * would sit at `null` permanently, every shared-content surface silently
 * empty. That is not hypothetical: it left campaign-less players with no
 * spells at all, which combined with the level-up wizard's mandatory spell
 * picks produced a level-up that could never be confirmed (#736, #737).
 *
 * Use this rather than re-deriving the computed. Six call sites had their own
 * copy; exactly one of them remembered the standalone case, and the surfaces
 * behind the other five were empty for anyone without a campaign.
 */
export function useLibrarySourceSlugs() {
  const auth = useAuthStore();
  const { standalone } = useContentScope();
  const enabledQuery = useEnabledSources();
  const userQuery = useUserEnabledSources();
  const slugs = computed<string[] | null>(() =>
    resolveLibrarySlugs({
      standalone: standalone.value,
      campaignEnabled: enabledQuery.data.value,
      // Signed out: there are no rows to wait for, which is a known "none".
      userEnabled: auth.user ? userQuery.data.value : [],
    }),
  );
  return { slugs, isLoading: computed(() => (standalone.value ? userQuery.isLoading.value : enabledQuery.isLoading.value)) };
}

/** The decision behind {@link useLibrarySourceSlugs}, free of Vue and the
 *  stores so the rule can be asserted directly. Exported for testing. */
export function resolveLibrarySlugs(input: {
  standalone: boolean;
  campaignEnabled: Pick<EnabledSource, "source_slug">[] | undefined;
  userEnabled: Pick<UserEnabledSource, "source_slug">[] | undefined;
}): string[] | null {
  if (input.standalone) {
    if (input.userEnabled === undefined) return null;
    return [...new Set([...STANDALONE_LIBRARY_SLUGS, ...input.userEnabled.map((e) => e.source_slug)])];
  }
  return input.campaignEnabled?.map((e) => e.source_slug) ?? null;
}

export function useAvailableLibrarySources() {
  const { ruleset } = useTableRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAvailableLibrarySources(rs),
    staleTime: Infinity,
  });
}

async function fetchAvailableLibrarySpellSources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_spell_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

export function useAvailableLibrarySpellSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_SPELL_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAvailableLibrarySpellSources(rs),
    staleTime: Infinity,
  });
}

async function fetchAvailableLibraryItemSources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_item_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

export function useAvailableLibraryItemSources() {
  const { ruleset } = useTableRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_ITEM_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAvailableLibraryItemSources(rs),
    staleTime: Infinity,
  });
}

async function fetchAvailableLibrarySpeciesSources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_species_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

export function useAvailableLibrarySpeciesSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_SPECIES_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAvailableLibrarySpeciesSources(rs),
    staleTime: Infinity,
  });
}

function invalidateLibrary(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [ENABLED_KEY] });
  queryClient.invalidateQueries({ queryKey: [USER_ENABLED_KEY] });
  queryClient.invalidateQueries({ queryKey: ["library-monsters"] });
  queryClient.invalidateQueries({ queryKey: ["library-spells"] });
  queryClient.invalidateQueries({ queryKey: ["library-items"] });
  queryClient.invalidateQueries({ queryKey: ["library-species"] });
  // Backgrounds are seeded per player from the enabled books.
  queryClient.invalidateQueries({ queryKey: ["backgrounds"] });
}

async function fetchAvailablePlayerBooks(): Promise<AvailableLibrarySource[]> {
  // Both editions: a table-less character picks its edition per character.
  const [species, spells] = await Promise.all([
    supabase.rpc("get_library_species_sources", { p_ruleset: null }),
    supabase.rpc("get_library_spell_sources", { p_ruleset: null }),
  ]);
  if (species.error) throw species.error;
  if (spells.error) throw spells.error;
  return mergeAvailableSources([
    ...((species.data ?? []) as AvailableLibrarySource[]),
    ...((spells.data ?? []) as AvailableLibrarySource[]),
  ]);
}

/** Sums counts per source and sorts by title. Exported for testing. */
export function mergeAvailableSources(rows: AvailableLibrarySource[]): AvailableLibrarySource[] {
  const bySource = new Map<string, AvailableLibrarySource>();
  for (const row of rows) {
    const seen = bySource.get(row.source);
    if (seen) {
      seen.count += row.count;
      seen.source_title = seen.source_title ?? row.source_title;
    } else {
      bySource.set(row.source, { ...row });
    }
  }
  return [...bySource.values()].sort((a, b) =>
    (a.source_title ?? a.source).localeCompare(b.source_title ?? b.source),
  );
}

/** The books a player could enable: everything the library holds for species or spells, both editions. */
export function useAvailablePlayerBooks() {
  return useQuery({
    queryKey: [AVAILABLE_PLAYER_KEY] as const,
    queryFn: fetchAvailablePlayerBooks,
    staleTime: Infinity,
  });
}

export function useEnableUserSource() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ source_slug, source_title }: { source_slug: string; source_title: string | null }) => {
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_enabled_sources")
        .insert({ user_id: userId, source_slug, source_title });
      if (error) throw error;
    },
    onSuccess: () => invalidateLibrary(queryClient),
  });
}

export function useDisableUserSource() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source_slug: string) => {
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_enabled_sources")
        .delete()
        .eq("user_id", userId)
        .eq("source_slug", source_slug);
      if (error) throw error;
    },
    onSuccess: () => invalidateLibrary(queryClient),
  });
}

export function useEnableSource() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source_slug, source_title }: { source_slug: string; source_title: string | null }) =>
      enableSource(campaign.activeCampaignId!, source_slug, source_title),
    onSuccess: () => invalidateLibrary(queryClient),
  });
}

export function useDisableSource() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source_slug: string) =>
      disableSource(campaign.activeCampaignId!, source_slug),
    onSuccess: () => invalidateLibrary(queryClient),
  });
}
