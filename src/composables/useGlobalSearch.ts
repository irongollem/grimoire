import { computed, type Ref } from "vue";
import { refDebounced, useLocalStorage } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { orFilterValue } from "@/lib/postgrestFilter";
import { useCampaignStore } from "@/stores/campaign";
import { placeRoute } from "@/lib/locations/placeRoute";
import { useAuthStore } from "@/stores/auth";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useRuleset, useTableRuleset } from "@/composables/rules/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";
import { reportHandledError } from "@/lib/observability/sentry";
import { mergeSearchGroups, type SearchGroup } from "@/lib/search/mergeSearchHits";
import type { CampaignSearchHit, CampaignSearchResponse } from "@edge-shared/campaignSearch.ts";

export type { SearchGroup, SearchHit } from "@/lib/search/mergeSearchHits";

export interface SearchResult {
  groups: SearchGroup[];
  /** Labels (as the user sees them) of groups whose read failed. */
  failedGroups: string[];
}

const LIMIT = 5;

/** `campaign_id = active OR campaign_id is null`: the scope `useItems` /
 *  `useMonsterIndex` give their own lists. Without a campaign, nothing narrows. */
function scopedToCampaign<T extends { or: (filter: string) => T }>(builder: T, campaignId: string | null): T {
  return campaignId ? builder.or(`campaign_id.eq.${campaignId},campaign_id.is.null`) : builder;
}

/** Which books and edition the keyword tier reads, resolved the way the
 *  bestiary and spell lists resolve them (`useMonsterIndex`, `useSpellIndex`). */
interface SearchScope {
  /** Enabled library source slugs. Empty means no book is on: skip library reads. */
  slugs: string[];
  /** Table rules (monsters). */
  tableRuleset: RulesetKey;
  /** Build rules (spells). */
  buildRuleset: RulesetKey;
}

async function searchAll(query: string, campaignId: string | null, scope: SearchScope): Promise<SearchResult> {
  const noRows = { data: [] as { id: string; name: string }[], error: null };
  const q = `%${query}%`;

  const [
    notesRes,
    npcsRes,
    monstersRes,
    libraryMonstersRes,
    spellsRes,
    librarySpellsRes,
    itemsRes,
    locationsRes,
    questsRes,
    factionsRes,
  ] = await Promise.all([
    campaignId
      ? supabase.from("notes").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    campaignId
      ? supabase.from("npcs").select("id, name, disguise_name").eq("campaign_id", campaignId).or(`name.ilike.${orFilterValue(q)},disguise_name.ilike.${orFilterValue(q)}`).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string; disguise_name: string | null }[], error: null }),
    // Custom monsters and items: this campaign's own plus the DM's globals, the
    // scope their list views use, so one campaign's material stays out of another's.
    scopedToCampaign(
      supabase.from("monsters").select("id, name").ilike("name", q).not("open5e_import", "eq", true)
        .or(`ruleset.is.null,ruleset.eq.${scope.tableRuleset}`),
      campaignId,
    ).limit(LIMIT),
    scope.slugs.length === 0
      ? Promise.resolve(noRows)
      : supabase.from("library_monsters").select("id, name").ilike("name", q)
        .in("source", scope.slugs).eq("ruleset", scope.tableRuleset).limit(LIMIT),
    supabase.from("spells").select("id, name").ilike("name", q).not("open5e_import", "eq", true)
      .or(`ruleset.is.null,ruleset.eq.${scope.buildRuleset}`).limit(LIMIT),
    scope.slugs.length === 0
      ? Promise.resolve(noRows)
      : supabase.from("library_spells").select("id, name").ilike("name", q)
        .in("source", scope.slugs).eq("ruleset", scope.buildRuleset).limit(LIMIT),
    scopedToCampaign(supabase.from("items").select("id, name").ilike("name", q), campaignId).limit(LIMIT),
    // `.or` rather than `.eq` — a location with campaign_id null is meant to
    // be visible in every campaign (#596), same as items/spells/species below.
    campaignId
      ? supabase.from("locations").select("id, name").or(`campaign_id.eq.${campaignId},campaign_id.is.null`).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    campaignId
      ? supabase.from("quests").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    campaignId
      ? supabase.from("factions").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);

  // One failing table must not blank the others. Each failure goes to Sentry
  // and its group label is handed back so the UI can say what was not searched;
  // only when every read failed is the search itself down, and that throws.
  const reads = [
    { label: "Notes", res: notesRes },
    { label: "NPCs", res: npcsRes },
    { label: "Bestiary", res: monstersRes },
    { label: "Bestiary", res: libraryMonstersRes },
    { label: "Spells", res: spellsRes },
    { label: "Spells", res: librarySpellsRes },
    { label: "Vault", res: itemsRes },
    { label: "Locations", res: locationsRes },
    { label: "Quests", res: questsRes },
    { label: "Factions", res: factionsRes },
  ];
  const failedReads = reads.filter((r) => r.res.error);
  for (const { label, res } of failedReads) reportHandledError(res.error, "global-search", { group: label });
  if (failedReads.length === reads.length && failedReads[0]?.res.error) throw failedReads[0].res.error;
  const failedGroups = [...new Set(failedReads.map((r) => r.label))];

  const groups: SearchGroup[] = [
    {
      type: "npc",
      label: "NPCs",
      items: ((npcsRes.data ?? []) as { id: string; name: string; disguise_name: string | null }[]).map((r) => ({
        id: r.id,
        name: r.disguise_name ? `${r.name} (${r.disguise_name})` : r.name,
        route: `/npcs/${r.id}`,
        matchedBy: "name" as const,
      })),
    },
    {
      type: "monster",
      label: "Bestiary",
      items: (() => {
        const custom = (monstersRes.data ?? []) as { id: string; name: string }[];
        const customNames = new Set(custom.map((r) => r.name.toLowerCase()));
        const srd = ((libraryMonstersRes.data ?? []) as { id: string; name: string }[])
          .filter((r) => !customNames.has(r.name.toLowerCase()));
        return [...custom, ...srd]
          .slice(0, LIMIT)
          .map((r) => ({ id: r.id, name: r.name, route: `/monsters/${r.id}`, matchedBy: "name" as const }));
      })(),
    },
    {
      type: "note",
      label: "Notes",
      items: ((notesRes.data ?? []) as { id: string; title: string }[]).map((r) => ({
        id: r.id,
        name: r.title,
        route: `/notes/${r.id}`,
        matchedBy: "name" as const,
      })),
    },
    {
      type: "spell",
      label: "Spells",
      items: (() => {
        const custom = (spellsRes.data ?? []) as { id: string; name: string }[];
        const customNames = new Set(custom.map((r) => r.name.toLowerCase()));
        const srd = ((librarySpellsRes.data ?? []) as { id: string; name: string }[])
          .filter((r) => !customNames.has(r.name.toLowerCase()));
        return [...custom, ...srd]
          .slice(0, LIMIT)
          .map((r) => ({ id: r.id, name: r.name, route: `/spells/${r.id}`, matchedBy: "name" as const }));
      })(),
    },
    {
      type: "item",
      label: "Vault",
      items: ((itemsRes.data ?? []) as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
        route: `/vault/${r.id}`,
        matchedBy: "name" as const,
      })),
    },
    {
      type: "location",
      label: "Locations",
      items: ((locationsRes.data ?? []) as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
        route: placeRoute(r.id),
        matchedBy: "name" as const,
      })),
    },
    {
      type: "faction",
      label: "Factions",
      items: ((factionsRes.data ?? []) as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
        route: `/factions/${r.id}`,
        matchedBy: "name" as const,
      })),
    },
    {
      type: "quest",
      label: "Quests",
      items: ((questsRes.data ?? []) as { id: string; title: string }[]).map((r) => ({
        id: r.id,
        name: r.title,
        route: `/quests/${r.id}`,
        matchedBy: "name" as const,
      })),
    },
  ];

  return { groups: groups.filter((g) => g.items.length > 0), failedGroups };
}

/** How long typing must pause before a search goes out. One search is nine
 *  requests, so searching every keystroke sent ~60 for an eight-letter word. */
export const SEARCH_DEBOUNCE_MS = 250;

/** One search is one query embedding, so the by-meaning tier waits for a real
 *  pause rather than the keyword tier's short one. */
export const SEMANTIC_DEBOUNCE_MS = 500;

/** At or below this many name hits, a free DM is told search by meaning exists. */
export const PRO_UPSELL_MAX_HITS = 2;

/** Browser-local: a dismissed note stays dismissed on this device only. */
export const PRO_UPSELL_DISMISSED_KEY = "grimoire:search-by-meaning-upsell-dismissed";

/** Below this the embedding of a fragment says little and costs the same. */
const SEMANTIC_MIN_QUERY = 3;

/**
 * The by-meaning read. Never throws: the keyword tier is the search, this only
 * adds to it, so every way it can go wrong collapses to "no extra hits".
 * Expected degradations arrive as a 200 with `unavailable`; a 403 means the
 * caller is not a DM of the campaign; anything else is a real fault, reported.
 */
async function searchByMeaning(query: string, campaignId: string): Promise<CampaignSearchHit[]> {
  try {
    const { data, error } = await supabase.functions.invoke("search-campaign", {
      body: { query, campaign_id: campaignId },
    });
    if (error) {
      if ((error as { context?: Response }).context?.status === 403) return [];
      throw error;
    }
    const reply = data as CampaignSearchResponse | null;
    if (!reply) throw new Error("search-campaign answered with no body");
    return reply.unavailable ? [] : reply.hits;
  } catch (e) {
    reportHandledError(e, "campaign-search");
    return [];
  }
}

export function useGlobalSearch(query: Ref<string>) {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const { isPro, isLoading: subscriptionLoading } = useSubscription();
  const { isChild, isLoading: childLoading } = useChildAccount();
  const campaignId = computed(() => campaign.activeCampaignId ?? null);
  const trimmed = computed(() => query.value.trim());
  const settled = refDebounced(trimmed, SEARCH_DEBOUNCE_MS);
  // Resolved in the scope the search box sits in (no character scope above it:
  // the active campaign's books and edition), like the lists it jumps to.
  const { slugs } = useLibrarySourceSlugs();
  const { ruleset: tableRuleset } = useTableRuleset();
  const { ruleset: buildRuleset } = useRuleset();
  const semanticSettled = refDebounced(trimmed, SEMANTIC_DEBOUNCE_MS);

  const result = useQuery({
    queryKey: computed(
      () => ["global-search", settled.value, campaignId.value, slugs.value, tableRuleset.value, buildRuleset.value] as const,
    ),
    queryFn: ({ queryKey: [, search, activeCampaignId, enabledSlugs, table, build] }) => {
      if (enabledSlugs === null) throw new Error("global search ran before the enabled sources loaded");
      return searchAll(search, activeCampaignId, { slugs: enabledSlugs, tableRuleset: table, buildRuleset: build });
    },
    // A cached read, so waiting for the enabled books is short; searching
    // before they are known would leak disabled books' rows.
    enabled: () => settled.value.length >= 2 && slugs.value !== null,
    staleTime: 30_000,
    placeholderData: { groups: [], failedGroups: [] } satisfies SearchResult,
  });

  // Players never fire it: the function answers 403 to them, and the corpus is
  // DM material. `isDM` is the active campaign's membership role. Search by
  // meaning is a Pro feature of the DM's own account (the function answers
  // `pro_only` otherwise), so a free account never sends the request; every
  // plan keeps the keyword tier above.
  const semanticEligible = computed(
    () => trimmed.value.length >= SEMANTIC_MIN_QUERY && campaignId.value !== null && auth.isDM && isPro.value,
  );

  const semantic = useQuery({
    queryKey: computed(() => ["campaign-search", semanticSettled.value, campaignId.value] as const),
    queryFn: ({ queryKey: [, search, activeCampaignId] }) => {
      if (activeCampaignId === null) throw new Error("campaign search ran without a campaign");
      return searchByMeaning(search, activeCampaignId);
    },
    enabled: () => semanticSettled.value.length >= SEMANTIC_MIN_QUERY && campaignId.value !== null && auth.isDM && isPro.value,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // The meaning hits answer `semanticSettled`; they belong on screen only while
  // that is also the term the keyword groups answer.
  const semanticHits = computed<CampaignSearchHit[]>(() =>
    semanticSettled.value === settled.value && semanticEligible.value ? (semantic.data.value ?? []) : [],
  );

  const data = computed<SearchResult | undefined>(() => {
    const keyword = result.data.value;
    if (!keyword) return keyword;
    return { ...keyword, groups: mergeSearchGroups(keyword.groups, semanticHits.value) };
  });

  // Still typing counts as searching: the results on screen are for a term
  // the DM has already moved past.
  const isFetching = computed(() => result.isFetching.value || (trimmed.value.length >= 2 && settled.value !== trimmed.value));

  /** The by-meaning tier has not answered yet. Surfaces show a quiet row for it
   *  and must never wait on it. */
  const isSemanticPending = computed(
    () => semanticEligible.value && (semantic.isFetching.value || semanticSettled.value !== trimmed.value),
  );

  // Free DMs see one quiet line under a search that found little by name,
  // the moment search by meaning would have helped (#599). Only then, not on
  // every search: a note that answers a real miss sells, one on every query is
  // noise. Never for a player, a Pro or tester account, or a child (#928: we
  // never sell to a child), and not while the plan is still loading, so a Pro
  // account never sees it flash. Dismissed per browser, on purpose: seeing it
  // once more on another device surprises nobody.
  const upsellDismissed = useLocalStorage(PRO_UPSELL_DISMISSED_KEY, false);
  const showProUpsell = computed(() => {
    if (upsellDismissed.value || !auth.isDM || campaignId.value === null) return false;
    if (subscriptionLoading.value || childLoading.value || isPro.value || isChild.value) return false;
    if (settled.value.length < SEMANTIC_MIN_QUERY || isFetching.value) return false;
    const hits = (result.data.value?.groups ?? []).reduce((n, g) => n + g.items.length, 0);
    return hits <= PRO_UPSELL_MAX_HITS;
  });
  function dismissProUpsell() {
    upsellDismissed.value = true;
  }

  return { ...result, data, isFetching, isSemanticPending, showProUpsell, dismissProUpsell };
}

/** "Quests", "Quests and Locations", "Notes, Quests and Locations". */
export function failedGroupsMessage(failedGroups: string[]): string {
  const list = failedGroups.length > 1
    ? `${failedGroups.slice(0, -1).join(", ")} and ${failedGroups[failedGroups.length - 1]}`
    : failedGroups.join("");
  return `Couldn't search ${list}.`;
}
