import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

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

const LIMIT = 5;

async function searchAll(query: string, campaignId: string | null): Promise<SearchGroup[]> {
  const q = `%${query}%`;

  const [
    notesRes,
    npcsRes,
    monstersRes,
    srdMonstersRes,
    spellsRes,
    itemsRes,
    locationsRes,
    questsRes,
  ] = await Promise.all([
    campaignId
      ? supabase.from("notes").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    campaignId
      ? supabase.from("npcs").select("id, name, disguise_name").eq("campaign_id", campaignId).or(`name.ilike.${q},disguise_name.ilike.${q}`).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string; disguise_name: string | null }[], error: null }),
    supabase.from("monsters").select("id, name").ilike("name", q).not("open5e_import", "eq", true).limit(LIMIT),
    supabase.from("srd_monsters").select("id, name").ilike("name", q).limit(LIMIT),
    supabase.from("spells").select("id, name").ilike("name", q).limit(LIMIT),
    supabase.from("items").select("id, name").ilike("name", q).limit(LIMIT),
    campaignId
      ? supabase.from("locations").select("id, name").eq("campaign_id", campaignId).ilike("name", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    campaignId
      ? supabase.from("quests").select("id, title").eq("campaign_id", campaignId).ilike("title", q).limit(LIMIT)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
  ]);

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
        const srd = ((srdMonstersRes.data ?? []) as { id: string; name: string }[])
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
      items: ((spellsRes.data ?? []) as { id: string; name: string }[]).map((r) => ({
        id: r.id,
        name: r.name,
        route: `/spells/${r.id}`,
      })),
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
        route: `/locations/${r.id}`,
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

  return groups.filter((g) => g.items.length > 0);
}

export function useGlobalSearch(query: Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId ?? null);
  const trimmed = computed(() => query.value.trim());

  return useQuery({
    queryKey: computed(() => ["global-search", trimmed.value, campaignId.value]),
    queryFn: () => searchAll(trimmed.value, campaignId.value),
    enabled: () => trimmed.value.length >= 2,
    staleTime: 30_000,
    placeholderData: [],
  });
}
