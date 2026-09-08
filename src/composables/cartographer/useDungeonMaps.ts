import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import {
  type DungeonMap,
  type DungeonMapInsert,
  type DungeonMapUpdate,
  emptyLayers,
} from "@/types/dungeonMap.types";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";
import { useCampaignStore } from "@/stores/campaign";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";

// Matches the table name exactly — `useDeleteCampaign` invalidates every
// HOMEBREW_TABLES entry by that literal string (see useCampaigns.ts), so a
// query key that drifts from the table name silently stops being refreshed
// after a promote/delete disposition.
const QUERY_KEY = "dungeon_maps";

async function fetchDungeonMaps(): Promise<DungeonMap[]> {
  const { data, error } = await supabase
    .from("dungeon_maps")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as DungeonMap[];
}

async function fetchDungeonMap(id: string): Promise<DungeonMap | null> {
  const { data, error } = await supabase
    .from("dungeon_maps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DungeonMap | null;
}

async function createDungeonMap(map: Partial<DungeonMapInsert> & { name: string }): Promise<DungeonMap> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const payload = {
    name: map.name,
    description: map.description ?? null,
    layers: map.layers ?? emptyLayers(),
    metadata: map.metadata ?? {},
    default_pack_id: map.default_pack_id ?? null,
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
  return data as DungeonMap;
}

async function updateDungeonMap(id: string, update: DungeonMapUpdate): Promise<DungeonMap> {
  const { data, error } = await supabase
    .from("dungeon_maps")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DungeonMap;
}

async function deleteDungeonMap(id: string): Promise<void> {
  const { error } = await supabase.from("dungeon_maps").delete().eq("id", id);
  if (error) throw error;
}

/** Null-means-global scoping (#789), same rule as `useMonsters`/`useTraps`:
 *  maps with `campaign_id === null` are available everywhere, plus whatever
 *  is scoped to the active campaign. */
export function useDungeonMaps() {
  const query = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchDungeonMaps });
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
    queryKey: computed(() => [QUERY_KEY, resolved.value]),
    queryFn: () => fetchDungeonMap(resolved.value),
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
