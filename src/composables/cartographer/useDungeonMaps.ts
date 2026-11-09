import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import {
  type DungeonMap,
  type DungeonMapInsert,
  type DungeonMapUpdate,
} from "@/types/dungeonMap.types";
import { hasBrushedArea, readLayers } from "@/cartographer/areaToWalls";
import type { LayersWithArea } from "@/cartographer/area";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";
import { useCampaignStore } from "@/stores/campaign";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";

// Matches the table name exactly — `useDeleteCampaign` invalidates every
// HOMEBREW_TABLES entry by that literal string (see useCampaigns.ts), so a
// query key that drifts from the table name silently stops being refreshed
// after a promote/delete disposition.
/** Root of every dungeon map read; also invalidated by a write made outside these hooks (useSaveStyledSitePicture). */
export const DUNGEON_MAPS_KEY = "dungeon_maps";
const QUERY_KEY = DUNGEON_MAPS_KEY;

/** Rows are cast, not typed by the client, so a map saved before a layer
 *  existed arrives without that key. Every read goes through here.
 *
 *  The queries apply it in `select`, not in their queryFn: this list is
 *  persisted to the device (queryPersistence, a `live` root), and a disk copy
 *  is served without running the queryFn, so a copy written by a build that
 *  normalized less (or not at all) would otherwise reach the screen raw. That
 *  is how a map with no `area` layer crashed the Cartographer list's cell
 *  count (Sentry DUNGEON-GRIMOIRE-P). */
function readDungeonMap(row: DungeonMap): DungeonMap {
  return { ...row, layers: readLayers(row.layers, { newKey: () => crypto.randomUUID() }) };
}

/**
 * A row saved with the old brush (`layers.area`) is converted to walls on its first read and written back once, so the
 * new wall ids are the ones every later read sees; a read that never saved would mint fresh ids each time. Only the
 * owner's row is written (a DM or admin reading someone else's map converts in memory only).
 */
async function convertStoredArea(row: DungeonMap): Promise<DungeonMap> {
  if (!hasBrushedArea(row.layers as LayersWithArea) && row.layers.ground !== undefined) return row;
  const converted = readDungeonMap(row);
  if (row.user_id !== getCurrentUser()?.id) return converted;
  const { data, error } = await supabase
    .from("dungeon_maps")
    .update({ layers: converted.layers })
    .eq("id", row.id)
    .select()
    .single();
  if (error) throw error;
  return data as DungeonMap;
}

function readDungeonMaps(rows: DungeonMap[]): DungeonMap[] {
  return rows.map(readDungeonMap);
}

function readMaybeDungeonMap(row: DungeonMap | null): DungeonMap | null {
  return row ? readDungeonMap(row) : null;
}

async function fetchDungeonMaps(): Promise<DungeonMap[]> {
  const { data, error } = await supabase
    .from("dungeon_maps")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return Promise.all((data as DungeonMap[]).map(convertStoredArea));
}

async function fetchDungeonMap(id: string): Promise<DungeonMap | null> {
  const { data, error } = await supabase
    .from("dungeon_maps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? convertStoredArea(data as DungeonMap) : null;
}

export async function createDungeonMap(map: Partial<DungeonMapInsert> & { name: string }): Promise<DungeonMap> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const payload = {
    name: map.name,
    description: map.description ?? null,
    layers: readLayers(map.layers, { newKey: () => crypto.randomUUID() }),
    metadata: map.metadata ?? {},
    default_pack_id: map.default_pack_id ?? null,
    darkness: map.darkness ?? "daylight",
    tags: map.tags ?? [],
    notes: map.notes ?? null,
    // NULL = available in every campaign; unset defaults to that rather than
    // silently inheriting whatever campaign happens to be active (#789).
    campaign_id: map.campaign_id ?? null,
    user_id: user.id,
  };
  const { data, error } = await supabase
    .from("dungeon_maps")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return readDungeonMap(data as DungeonMap);
}

async function updateDungeonMap(id: string, update: DungeonMapUpdate): Promise<DungeonMap> {
  const { data, error } = await supabase
    .from("dungeon_maps")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return readDungeonMap(data as DungeonMap);
}

async function deleteDungeonMap(id: string): Promise<void> {
  const { error } = await supabase.from("dungeon_maps").delete().eq("id", id);
  if (error) throw error;
}

/** Null-means-global scoping (#789), same rule as `useMonsters`/`useTraps`:
 *  maps with `campaign_id === null` are available everywhere, plus whatever
 *  is scoped to the active campaign. */
export function useDungeonMaps() {
  const query = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchDungeonMaps, select: readDungeonMaps });
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const data = computed(() => {
    const maps = query.data.value;
    if (!maps) return maps;
    return allowedCampaignScoped(maps, activeCampaignId.value);
  });
  return { ...query, data };
}

export function useDungeonMap(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value] as const),
    queryFn: ({ queryKey: [, mapId] }) => fetchDungeonMap(mapId),
    select: readMaybeDungeonMap,
    enabled: () => !!resolved.value,
  });
}

export function useCreateDungeonMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDungeonMap,
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateDungeonMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: DungeonMapUpdate }) =>
      updateDungeonMap(id, update),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteDungeonMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDungeonMap,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: [QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
