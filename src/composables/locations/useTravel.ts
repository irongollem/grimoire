import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { TRAVEL_KEY } from "@/lib/campaignLiveSync/registry";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useCampaignStore } from "@/stores/campaign";
import { flyingSpeed } from "@/lib/movement";
import { beastTravelOf, campaignTerrains, campaignWays, type BeastTravel, type CompanionSpeed, type Terrain, type TerrainRow, type WayOfTravel, type WayRow } from "@/rules/travelSpeed";

/**
 * A campaign's travel (#1222 decision 9): the preset terrains and ways of travelling with the campaign's own laid
 * over them by key, and the speed of each of its companions (a mount or a sled's puller travels at it). One read
 * of each table for the campaign, scoped in the query; rung by the campaign's live sync.
 */

const TERRAIN_COLUMNS = "id, key, name, factor, sink";
const WAY_COLUMNS = "id, key, name, kind, speed_feet, mph, companion_id, at_home, sink, through_the_night";

export type TerrainRecord = TerrainRow & { id: string };
export type WayRecord = WayRow & { id: string };

async function readTravel(campaignId: string): Promise<{ terrains: TerrainRecord[]; ways: WayRecord[] }> {
  const [terrains, ways] = await Promise.all([
    supabase.from("travel_terrains").select(TERRAIN_COLUMNS).eq("campaign_id", campaignId).order("created_at"),
    supabase.from("travel_ways").select(WAY_COLUMNS).eq("campaign_id", campaignId).order("created_at"),
  ]);
  if (terrains.error) throw terrains.error;
  if (ways.error) throw ways.error;
  return {
    // `numeric` columns: read as numbers, as everything downstream works with them.
    terrains: (terrains.data ?? []).map((r) => ({ ...r, factor: Number(r.factor), sink: Number(r.sink) })) as TerrainRecord[],
    ways: (ways.data ?? []).map((r) => ({ ...r, mph: r.mph === null ? null : Number(r.mph) })) as WayRecord[],
  };
}

/** The campaign's own rows, as stored: what Campaign Settings → Travel edits. */
export function useTravelRows() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [TRAVEL_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, id] }) => {
      if (!id) throw new Error("useTravelRows read without a campaign");
      return readTravel(id);
    },
    enabled: () => !!campaignId.value,
  });
}

/**
 * Everything a journey needs to say how long it takes: the terrains, the ways of travelling (only those that can
 * move: a way whose companion is gone is left out), the companions' speeds, and the open land's terrain.
 */
export function useTravel() {
  const campaign = useCampaignStore();
  const rows = useTravelRows();
  const { data: companions } = useCompanions();
  // Walking speed from the companion's own column; a flying mount travels at the fly speed in its stat block.
  const speeds = computed(() => new Map((companions.value ?? []).map((c) => [c.id, { walk: c.speed, fly: flyingSpeed(c.stat_block?.speed) }])));
  const companionSpeed: CompanionSpeed = (id, kind) => {
    const s = speeds.value.get(id);
    if (!s) return null;
    return kind === "air" ? s.fly : s.walk;
  };
  const terrains = computed<Terrain[]>(() => campaignTerrains(rows.data.value?.terrains ?? []));
  const ways = computed<WayOfTravel[]>(() =>
    campaignWays(rows.data.value?.ways ?? []).filter((w) => (w.mph !== null && w.mph > 0) || (w.companionId !== null ? companionSpeed(w.companionId, w.kind) !== null : w.speedFeet !== null)),
  );
  const openLand = computed(() => campaign.activeCampaign?.open_land_terrain ?? "difficult");
  return { rows, terrains, ways, companionSpeed, openLand, isLoading: computed(() => rows.isLoading.value) };
}

// ── Writes (Campaign Settings → Travel) ──────────────────────────────────────

function useTravelWrite<T>(write: (campaignId: string, input: T) => Promise<void>) {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (input: T) => {
      const id = campaign.activeCampaignId;
      if (!id) throw new Error("No campaign to change travel in");
      await write(id, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TRAVEL_KEY] }),
  });
}

function userId(): string {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

/** Saves a terrain by key: an override of a preset, or one of the campaign's own. */
export function useSaveTerrain() {
  return useTravelWrite<TerrainRow>(async (campaignId, row) => {
    const { error } = await supabase.from("travel_terrains").upsert({ ...row, campaign_id: campaignId, user_id: userId() }, { onConflict: "campaign_id,key" });
    if (error) throw error;
  });
}

/** Saves a way of travelling by key: an override of a preset, or one of the campaign's own. */
export function useSaveWay() {
  return useTravelWrite<WayRow>(async (campaignId, row) => {
    const { error } = await supabase.from("travel_ways").upsert({ ...row, campaign_id: campaignId, user_id: userId() }, { onConflict: "campaign_id,key" });
    if (error) throw error;
  });
}

/** Removes the campaign's row for a key: an overridden preset reads the book again, an own one is gone. */
export function useResetTravel(table: "travel_terrains" | "travel_ways") {
  return useTravelWrite<string>(async (campaignId, key) => {
    const { error } = await supabase.from(table).delete().eq("campaign_id", campaignId).eq("key", key);
    if (error) throw error;
  });
}

/**
 * What the bestiary says a companion is good for on the road (`library_monsters.travel`): read from the library row
 * the companion was made from, so picking "Snowbeak" for a sled fills in that an axe beak pulls and is at home on
 * snow. Null for a companion made from no library creature, or one the bestiary has not marked. `flies` is whether
 * the companion's own stat block has a fly speed.
 */
export function useBeastTravel(companionId: () => string | null) {
  const { data: companions } = useCompanions();
  const companion = computed(() => {
    const id = companionId();
    return id ? ((companions.value ?? []).find((c) => c.id === id) ?? null) : null;
  });
  const sourceId = computed(() => companion.value?.source_monster_id ?? null);
  const query = useQuery({
    queryKey: computed(() => ["library-monster-travel", sourceId.value] as const),
    queryFn: async ({ queryKey: [, id] }): Promise<BeastTravel | null> => {
      if (!id) return null;
      // A campaign monster's id is a uuid the library does not have: no row, no traits.
      const { data, error } = await supabase.from("library_monsters").select("travel").eq("id", id).maybeSingle();
      if (error) throw error;
      return beastTravelOf(data?.travel);
    },
    enabled: () => sourceId.value !== null,
    staleTime: Infinity,
  });
  const traits = computed(() => (sourceId.value === null ? null : (query.data.value ?? null)));
  const flies = computed(() => flyingSpeed(companion.value?.stat_block?.speed) !== null);
  return { traits, flies };
}
