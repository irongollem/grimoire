import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { refDebounced, useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { campaignScopeFilter } from "@/composables/campaign/campaignLibraryScope";
import { orFilterValue } from "@/lib/postgrestFilter";
import { useCampaignStore } from "@/stores/campaign";
import { placeRoute } from "@/lib/locations/placeRoute";
import { useAuthStore } from "@/stores/auth";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { useRuleset, useTableRuleset } from "@/composables/rules/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";
import { isUuid } from "@/lib/library/contentIdentity";
import { fetchLibraryMonsterArtEntries, withLibraryArtAll } from "@/composables/library/useLibraryMonsterArt";
import { reportHandledError } from "@/lib/observability/sentry";
import type { SearchGroup, SearchHit } from "@/lib/search/mergeSearchHits";
import {
  deityHit, mergeAllGroups, npcHit, partyHit, searchRoute, TIES_GROUP,
  type DeitySearchRow, type NpcSearchRow, type PartySearchRow, type SearchKind,
} from "@/lib/search/searchRows";
import { connectionsQueryKey, fetchConnections } from "@/lib/worldLinks/connectionsQuery";
import { parseTieQuery, rowMatchesTie, type TieQuery } from "@/lib/worldLinks/tieQuery";
import type { Connection } from "@/types/connections.types";
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import type { CampaignSearchHit, CampaignSearchResponse } from "@edge-shared/campaignSearch.ts";

export type { SearchGroup, SearchHit } from "@/lib/search/mergeSearchHits";

export interface SearchResult {
  groups: SearchGroup[];
  /** Labels (as the user sees them) of groups whose read failed. */
  failedGroups: string[];
}

const LIMIT = 5;

export interface GlobalSearchOptions {
  /**
   * Search only these kinds (the connection picker). Reads for the others are
   * not sent, meaning hits of the others are dropped, and the Ties group is
   * off. Omit, or null, for the whole campaign.
   */
  kinds?: MaybeRefOrGetter<readonly SearchKind[] | null | undefined>;
}

/** Kinds whose rows can be the subject of a tie query: the ones that hold links. */
const TIE_SUBJECT_KINDS = ["npc", "party_member", "faction", "location", "deity", "item"] as const satisfies readonly LinkKind[];
const TIE_SUBJECT_LIMIT = 3;
const TIE_ROW_LIMIT = 8;

/** The picture a result row wears: only NPCs and bestiary entries have one. */
export interface SearchThumbnail {
  src: string;
  focalPoint: { x: number; y: number } | null;
}
export type SearchThumbnails = Record<string, SearchThumbnail>;

/**
 * Portraits for the NPC and monster rows on screen, read from the ids the
 * search already returned (both tiers), so neither the keyword fan-out nor the
 * edge function carries art. A library monster gets the DM's own art layered
 * over the canonical, as the Bestiary shows it. Entries without art are simply
 * absent: the row falls back to an initial.
 */
async function fetchThumbnails(campaignId: string, npcIds: string[], monsterIds: string[]): Promise<SearchThumbnails> {
  const customIds = monsterIds.filter(isUuid);
  const libraryIds = monsterIds.filter((id) => !isUuid(id));
  const [npcs, custom, library] = await Promise.all([
    npcIds.length > 0
      ? supabase.from("npcs").select("id, portrait_url, portrait_focal_point").eq("campaign_id", campaignId).in("id", npcIds)
      : null,
    customIds.length > 0
      ? supabase.from("monsters").select("id, image_url, portrait_focal_point").in("id", customIds)
      : null,
    libraryIds.length > 0
      ? supabase.from("library_monsters").select("id, image_url, portrait_focal_point").in("id", libraryIds)
      : null,
  ]);
  if (npcs?.error) throw npcs.error;
  if (custom?.error) throw custom.error;
  if (library?.error) throw library.error;

  const out: SearchThumbnails = {};
  if (npcs?.data) {
    for (const row of npcs.data) {
      if (row.portrait_url) out[row.id] = { src: row.portrait_url, focalPoint: row.portrait_focal_point };
    }
  }
  if (custom?.data) {
    for (const row of custom.data) {
      if (row.image_url) out[row.id] = { src: row.image_url, focalPoint: row.portrait_focal_point };
    }
  }
  if (library?.data && library.data.length > 0) {
    const art = await fetchLibraryMonsterArtEntries(libraryIds);
    // `library_monsters` has no cutout column; the merge only needs the key.
    const merged = withLibraryArtAll(library.data.map((row) => ({ ...row, cutout_url: null })), art);
    for (const row of merged) {
      if (row.image_url) out[row.id] = { src: row.image_url, focalPoint: row.portrait_focal_point };
    }
  }
  return out;
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

/** What `searchAll` needs besides the query: which kinds to read, and how to read a thing's connections. */
interface SearchPlan {
  /** Null reads everything and answers tie questions. */
  kinds: ReadonlySet<SearchKind> | null;
  connections: (kind: LinkKind, id: string) => Promise<Connection[]>;
}

/** What every read answers with; the rows are cast where each group is built. */
interface SearchRead {
  data: unknown[] | null;
  error: unknown;
}

/** The names that tie questions ask about, across the kinds that hold links. */
async function findTieSubjects(name: string, campaignId: string, ownerId: string | null, userId: string):
Promise<{ kind: LinkKind; id: string; name: string }[]> {
  const q = `%${name}%`;
  const reads = await Promise.all([
    supabase.from("npcs").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(TIE_SUBJECT_LIMIT),
    supabase.from("party_members").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(TIE_SUBJECT_LIMIT),
    supabase.from("factions").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(TIE_SUBJECT_LIMIT),
    supabase.from("locations").select("id, name").or(campaignScopeFilter(campaignId, userId, ownerId)).ilike("name", q).limit(TIE_SUBJECT_LIMIT),
    supabase.from("deities").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(TIE_SUBJECT_LIMIT),
    supabase.from("items").select("id, name").or(campaignScopeFilter(campaignId, userId, ownerId)).ilike("name", q).limit(TIE_SUBJECT_LIMIT),
  ]);
  const out: { kind: LinkKind; id: string; name: string }[] = [];
  reads.forEach((res, i) => {
    if (res.error) {
      reportHandledError(res.error, "global-search", { group: "Ties" });
      return;
    }
    for (const row of res.data as { id: string; name: string }[]) out.push({ kind: TIE_SUBJECT_KINDS[i], id: row.id, name: row.name });
  });
  const needle = name.toLowerCase();
  const rank = (n: string) => (n.toLowerCase() === needle ? 0 : n.toLowerCase().startsWith(needle) ? 1 : 2);
  return out.sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length);
}

/**
 * The "Ties" group (#1084): the far ends of the tie a query names, around the
 * best name hit and at most two more. A failure is reported and costs the group,
 * never the search.
 */
async function searchTies(
  tie: TieQuery, campaignId: string, ownerId: string | null, userId: string, plan: SearchPlan,
): Promise<SearchGroup | null> {
  try {
    const subjects = (await findTieSubjects(tie.name, campaignId, ownerId, userId)).slice(0, 3);
    const items: SearchHit[] = [];
    const seen = new Set<string>();
    const answers = await Promise.all(subjects.map((s) => plan.connections(s.kind, s.id)));
    subjects.forEach((subject, i) => {
      for (const row of answers[i]) {
        const word = rowMatchesTie(row, tie.words);
        const key = `${row.other_kind}:${row.other_id}`;
        if (!word || seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: row.other_id,
          name: row.other_name,
          route: searchRoute(row.other_kind, row.other_id),
          kind: row.other_kind,
          tie: `${word.word} ${subject.name}`,
          matchedBy: "name",
        });
      }
    });
    return items.length > 0 ? { type: TIES_GROUP, label: "Ties", items: items.slice(0, TIE_ROW_LIMIT) } : null;
  } catch (e) {
    reportHandledError(e, "global-search", { group: "Ties" });
    return null;
  }
}

async function searchAll(query: string, campaignId: string | null, ownerId: string | null, scope: SearchScope, plan: SearchPlan): Promise<SearchResult> {
  const noRows: SearchRead = { data: [], error: null };
  const wants = (kind: SearchKind) => plan.kinds === null || plan.kinds.has(kind);
  const skip = (kind: SearchKind, read: () => PromiseLike<SearchRead>): PromiseLike<SearchRead> =>
    wants(kind) ? read() : Promise.resolve(noRows);
  const user = getCurrentUser();
  if (!user) throw new Error("global search ran without a signed-in user");
  const q = `%${query}%`;

  const [
    notesRes,
    npcsRes,
    partyRes,
    monstersRes,
    libraryMonstersRes,
    spellsRes,
    librarySpellsRes,
    itemsRes,
    locationsRes,
    questsRes,
    factionsRes,
    deitiesRes,
  ] = await Promise.all([
    skip("note", () => campaignId
      ? supabase.from("notes").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null })),
    skip("npc", () => campaignId
      ? supabase.from("npcs")
        .select("id, name, disguise_name, occupation, location:locations!npcs_location_id_fkey(name)")
        .eq("campaign_id", campaignId).or(`name.ilike.${orFilterValue(q)},disguise_name.ilike.${orFilterValue(q)}`).limit(LIMIT)
      : Promise.resolve({ data: [] as NpcSearchRow[], error: null })),
    skip("party_member", () => campaignId
      ? supabase.from("party_members").select("id, name, class, level").eq("campaign_id", campaignId).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as PartySearchRow[], error: null })),
    // Custom monsters and items: this campaign's own plus the DM's globals, the
    // scope their list views use, so one campaign's material stays out of another's.
    skip("monster", () => supabase.from("monsters").select("id, name").ilike("name", q).not("open5e_import", "eq", true)
      .or(campaignScopeFilter(campaignId, user.id, ownerId))
      .or(`ruleset.is.null,ruleset.eq.${scope.tableRuleset}`).limit(LIMIT)),
    scope.slugs.length === 0 || !wants("monster")
      ? Promise.resolve(noRows)
      : supabase.from("library_monsters").select("id, name").ilike("name", q)
        .in("source", scope.slugs).eq("ruleset", scope.tableRuleset).limit(LIMIT),
    skip("spell", () => supabase.from("spells").select("id, name").ilike("name", q).not("open5e_import", "eq", true)
      .or(`ruleset.is.null,ruleset.eq.${scope.buildRuleset}`).limit(LIMIT)),
    scope.slugs.length === 0 || !wants("spell")
      ? Promise.resolve(noRows)
      : supabase.from("library_spells").select("id, name").ilike("name", q)
        .in("source", scope.slugs).eq("ruleset", scope.buildRuleset).limit(LIMIT),
    skip("item", () => supabase.from("items").select("id, name").ilike("name", q).or(campaignScopeFilter(campaignId, user.id, ownerId)).limit(LIMIT)),
    // `.or` rather than `.eq` — a location with campaign_id null is meant to
    // be visible in every campaign (#596), same as items/spells/species below.
    skip("location", () => campaignId
      ? supabase.from("locations").select("id, name").or(campaignScopeFilter(campaignId, user.id, ownerId)).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null })),
    skip("quest", () => campaignId
      ? supabase.from("quests").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null })),
    skip("faction", () => campaignId
      ? supabase.from("factions").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null })),
    skip("deity", () => campaignId
      ? supabase.from("deities").select("id, name, titles, domains").eq("campaign_id", campaignId).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as DeitySearchRow[], error: null })),
  ]);

  // One failing table must not blank the others. Each failure goes to Sentry
  // and its group label is handed back so the UI can say what was not searched;
  // only when every read failed is the search itself down, and that throws.
  const reads = [
    { kind: "note", label: "Notes", res: notesRes },
    { kind: "npc", label: "NPCs", res: npcsRes },
    { kind: "party_member", label: "Party", res: partyRes },
    { kind: "monster", label: "Bestiary", res: monstersRes },
    { kind: "monster", label: "Bestiary", res: libraryMonstersRes },
    { kind: "spell", label: "Spells", res: spellsRes },
    { kind: "spell", label: "Spells", res: librarySpellsRes },
    { kind: "item", label: "Vault", res: itemsRes },
    { kind: "location", label: "Locations", res: locationsRes },
    { kind: "quest", label: "Quests", res: questsRes },
    { kind: "faction", label: "Factions", res: factionsRes },
    { kind: "deity", label: "Deities", res: deitiesRes },
  ].filter((r) => wants(r.kind as SearchKind));
  const failedReads = reads.filter((r) => r.res.error);
  for (const { label, res } of failedReads) reportHandledError(res.error, "global-search", { group: label });
  if (failedReads.length === reads.length && failedReads[0]?.res.error) throw failedReads[0].res.error;
  const failedGroups = [...new Set(failedReads.map((r) => r.label))];

  const groups: SearchGroup[] = [
    {
      type: "npc",
      label: "NPCs",
      items: ((npcsRes.data ?? []) as NpcSearchRow[]).map(npcHit),
    },
    {
      type: "party_member",
      label: "Party",
      items: ((partyRes.data ?? []) as PartySearchRow[]).map(partyHit),
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
      type: "deity",
      label: "Deities",
      items: ((deitiesRes.data ?? []) as DeitySearchRow[]).map(deityHit),
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

  // Tie questions ("who worships the drowned lady") are asked of the whole
  // campaign only, never of a picker limited to some kinds.
  const tie = plan.kinds === null && campaignId ? parseTieQuery(query) : null;
  const ties = tie && campaignId ? await searchTies(tie, campaignId, ownerId, user.id, plan) : null;

  return { groups: [...(ties ? [ties] : []), ...groups.filter((g) => g.items.length > 0)], failedGroups };
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

function withKinds(groups: SearchGroup[], kinds: ReadonlySet<SearchKind> | null): SearchGroup[] {
  const kept = kinds === null ? groups : groups.filter((g) => g.type === TIES_GROUP || kinds.has(g.type as SearchKind));
  // A row's kind is its group's unless it says otherwise (a tie names its far end's).
  return kept.map((g) => ({ ...g, items: g.items.map((item) => (item.kind ? item : { ...item, kind: g.type })) }));
}

export function useGlobalSearch(query: Ref<string>, options: GlobalSearchOptions = {}) {
  const queryClient = useQueryClient();
  const kindsKey = computed(() => {
    const kinds = toValue(options.kinds);
    return kinds ? [...new Set(kinds)].sort() : null;
  });
  const kindSet = computed<ReadonlySet<SearchKind> | null>(() => (kindsKey.value ? new Set(kindsKey.value) : null));
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const { isPro, isLoading: subscriptionLoading } = useSubscription();
  const { isChild, isLoading: childLoading } = useChildAccount();
  const campaignId = computed(() => campaign.activeCampaignId ?? null);
  const ownerId = computed(() => campaign.activeCampaign?.user_id ?? null);
  const trimmed = computed(() => query.value.trim());
  const settled = refDebounced(trimmed, SEARCH_DEBOUNCE_MS);
  // Resolved in the scope the search box sits in (no character scope above it:
  // the active campaign's books and edition), like the lists it jumps to.
  // Asked for only once there is something to search: the composable is mounted
  // on every page, and the books are needed by the first query, not the page load.
  const { slugs } = useLibrarySourceSlugs(() => settled.value.length >= 2);
  const { ruleset: tableRuleset } = useTableRuleset();
  const { ruleset: buildRuleset } = useRuleset();
  const semanticSettled = refDebounced(trimmed, SEMANTIC_DEBOUNCE_MS);

  const result = useQuery({
    queryKey: computed(
      () => ["global-search", settled.value, campaignId.value, ownerId.value, slugs.value, tableRuleset.value, buildRuleset.value, kindsKey.value] as const,
    ),
    queryFn: ({ queryKey: [, search, activeCampaignId, owner, enabledSlugs, table, build] }) => {
      if (enabledSlugs === null) throw new Error("global search ran before the enabled sources loaded");
      return searchAll(
        search, activeCampaignId, owner,
        { slugs: enabledSlugs, tableRuleset: table, buildRuleset: build },
        { kinds: kindSet.value, connections: (kind, id) => readConnections(queryClient, kind, id, activeCampaignId) },
      );
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
    return { ...keyword, groups: withKinds(mergeAllGroups(keyword.groups, semanticHits.value), kindSet.value) };
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
  const upsellDismissed = useStorage(PRO_UPSELL_DISMISSED_KEY, false, safeLocalStorage());
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

  // Thumbnails ride on whatever ids are on screen, in either tier. A failure
  // here is reported and costs the rows their picture, never the search.
  const thumbnailIds = computed(() => {
    const groups = data.value?.groups;
    // Rows by the kind they stand for, so a tie's far end gets its face too.
    const idsOf = (kind: string): string[] =>
      [...new Set((groups ?? []).flatMap((g) => g.items.filter((item) => item.kind === kind).map((item) => item.id)))].sort();
    return { npcs: idsOf("npc"), monsters: idsOf("monster") };
  });
  const thumbnailQuery = useQuery({
    queryKey: computed(() => ["search-thumbnails", campaignId.value, thumbnailIds.value] as const),
    queryFn: async ({ queryKey: [, activeCampaignId, ids] }) => {
      if (activeCampaignId === null) throw new Error("search thumbnails ran without a campaign");
      try {
        return await fetchThumbnails(activeCampaignId, ids.npcs, ids.monsters);
      } catch (e) {
        reportHandledError(e, "search-thumbnails");
        return {} satisfies SearchThumbnails;
      }
    },
    enabled: () => campaignId.value !== null && (thumbnailIds.value.npcs.length > 0 || thumbnailIds.value.monsters.length > 0),
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: (previous) => previous,
  });
  // Until the read answers there is simply no art yet: rows show initials.
  const NO_THUMBNAILS: SearchThumbnails = {};
  const thumbnails = computed<SearchThumbnails>(() => {
    const loaded = thumbnailQuery.data.value;
    return loaded === undefined ? NO_THUMBNAILS : loaded;
  });

  return { ...result, data, isFetching, isSemanticPending, showProUpsell, dismissProUpsell, thumbnails };
}

/** A thing's connections through the cache a sheet shares, so a tie question does not refetch what is open. */
function readConnections(queryClient: QueryClient, kind: LinkKind, id: string, campaignId: string | null): Promise<Connection[]> {
  return queryClient.fetchQuery({
    queryKey: connectionsQueryKey(kind, id, campaignId),
    queryFn: () => fetchConnections(kind, id, campaignId),
    staleTime: 30_000,
  });
}

/** "Quests", "Quests and Locations", "Notes, Quests and Locations". */
export function failedGroupsMessage(failedGroups: string[]): string {
  const list = failedGroups.length > 1
    ? `${failedGroups.slice(0, -1).join(", ")} and ${failedGroups[failedGroups.length - 1]}`
    : failedGroups.join("");
  return `Couldn't search ${list}.`;
}
