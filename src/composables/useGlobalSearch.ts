import { computed, type Ref } from "vue";
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { orFilterValue } from "@/lib/postgrestFilter";
import { useCampaignStore } from "@/stores/campaign";
import { placeRoute } from "@/lib/locations/placeRoute";
import { reportHandledError } from "@/lib/observability/sentry";

export interface SearchHit {
  id: string;
  name: string;
  route: string;
}

export interface SearchGroup {
  type: string;
  label: string;
  items: SearchHit[];
}

export interface SearchResult {
  groups: SearchGroup[];
  /** Labels (as the user sees them) of groups whose read failed. */
  failedGroups: string[];
}

const LIMIT = 5;

async function searchAll(query: string, campaignId: string | null): Promise<SearchResult> {
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
  ] = await Promise.all([
    campaignId
      ? supabase.from("notes").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    campaignId
      ? supabase.from("npcs").select("id, name, disguise_name").eq("campaign_id", campaignId).or(`name.ilike.${orFilterValue(q)},disguise_name.ilike.${orFilterValue(q)}`).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string; disguise_name: string | null }[], error: null }),
    supabase.from("monsters").select("id, name").ilike("name", q).not("open5e_import", "eq", true).limit(LIMIT),
    supabase.from("library_monsters").select("id, name").ilike("name", q).limit(LIMIT),
    supabase.from("spells").select("id, name").ilike("name", q).not("open5e_import", "eq", true).limit(LIMIT),
    supabase.from("library_spells").select("id, name").ilike("name", q).limit(LIMIT),
    supabase.from("items").select("id, name").ilike("name", q).limit(LIMIT),
    // `.or` rather than `.eq` — a location with campaign_id null is meant to
    // be visible in every campaign (#596), same as items/spells/species below.
    campaignId
      ? supabase.from("locations").select("id, name").or(`campaign_id.eq.${campaignId},campaign_id.is.null`).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    campaignId
      ? supabase.from("quests").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
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
          .map((r) => ({ id: r.id, name: r.name, route: `/monsters/${r.id}` }));
      })(),
    },
    {
      type: "note",
      label: "Notes",
      items: ((notesRes.data ?? []) as { id: string; title: string }[]).map((r) => ({
        id: r.id,
        name: r.title,
        route: `/notes/${r.id}`,
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
          .map((r) => ({ id: r.id, name: r.name, route: `/spells/${r.id}` }));
      })(),
    },
    {
      type: "item",
      label: "Vault",
      items: ((itemsRes.data ?? []) as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
        route: `/vault/${r.id}`,
      })),
    },
    {
      type: "location",
      label: "Locations",
      items: ((locationsRes.data ?? []) as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
        route: placeRoute(r.id),
      })),
    },
    {
      type: "quest",
      label: "Quests",
      items: ((questsRes.data ?? []) as { id: string; title: string }[]).map((r) => ({
        id: r.id,
        name: r.title,
        route: `/quests/${r.id}`,
      })),
    },
  ];

  return { groups: groups.filter((g) => g.items.length > 0), failedGroups };
}

/** How long typing must pause before a search goes out. One search is nine
 *  requests, so searching every keystroke sent ~60 for an eight-letter word. */
export const SEARCH_DEBOUNCE_MS = 250;

export function useGlobalSearch(query: Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId ?? null);
  const trimmed = computed(() => query.value.trim());
  const settled = refDebounced(trimmed, SEARCH_DEBOUNCE_MS);

  const result = useQuery({
    queryKey: computed(() => ["global-search", settled.value, campaignId.value] as const),
    queryFn: ({ queryKey: [, search, activeCampaignId] }) => searchAll(search, activeCampaignId),
    enabled: () => settled.value.length >= 2,
    staleTime: 30_000,
    placeholderData: { groups: [], failedGroups: [] } satisfies SearchResult,
  });

  // Still typing counts as searching: the results on screen are for a term
  // the DM has already moved past.
  const isFetching = computed(() => result.isFetching.value || (trimmed.value.length >= 2 && settled.value !== trimmed.value));

  return { ...result, isFetching };
}

/** "Quests", "Quests and Locations", "Notes, Quests and Locations". */
export function failedGroupsMessage(failedGroups: string[]): string {
  const list = failedGroups.length > 1
    ? `${failedGroups.slice(0, -1).join(", ")} and ${failedGroups[failedGroups.length - 1]}`
    : failedGroups.join("");
  return `Couldn't search ${list}.`;
}
