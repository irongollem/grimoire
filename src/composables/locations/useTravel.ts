import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { TRAVEL_KEY } from "@/lib/campaignLiveSync/registry";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useCampaignStore } from "@/stores/campaign";
import { campaignTerrains, campaignWays, type Terrain, type TerrainRow, type WayOfTravel, type WayRow } from "@/rules/travelSpeed";

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
  const speeds = computed(() => new Map((companions.value ?? []).map((c) => [c.id, c.speed])));
  const companionSpeed = (id: string): number | null => speeds.value.get(id) ?? null;
  const terrains = computed<Terrain[]>(() => campaignTerrains(rows.data.value?.terrains ?? []));
  const ways = computed<WayOfTravel[]>(() =>
    campaignWays(rows.data.value?.ways ?? []).filter((w) => (w.mph !== null && w.mph > 0) || (w.companionId !== null ? companionSpeed(w.companionId) !== null : w.speedFeet !== null)),
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
