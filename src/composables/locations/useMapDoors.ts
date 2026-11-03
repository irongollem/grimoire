import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { sameDoorStates } from "@/lib/battlemap/doors";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";
import type { MapLiveDoorState } from "@/types/mapLive.types";

/**
 * The doors of one place's map the DM opened or shut in play (`map_memory.door_states`, #1134): like the fog they
 * belong to the map, so exploring and every fight on it share them, and a door left open stays open afterwards.
 * Another device's change arrives through the doorbell (`map_memory` signal), never a poll. Writes go through
 * `set_map_door`, which only the DM may call and which returns the door list as it now stands.
 */
export function useMapDoors(campaignId: MaybeRefOrGetter<string | null>, placeId: MaybeRefOrGetter<string | null>) {
  const queryClient = useQueryClient();
  const key = computed(() => ["map-doors", toValue(campaignId), toValue(placeId)] as const);

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ queryKey: [, cid, pid] }): Promise<MapLiveDoorState[]> => {
      if (!cid || !pid) throw new Error("useMapDoors read without a campaign and place; enabled guarantees both");
      // Scoped by both ids here; RLS is only the ceiling.
      const { data, error } = await supabase
        .from("map_memory")
        .select("door_states")
        .eq("campaign_id", cid)
        .eq("location_id", pid)
        .maybeSingle();
      if (error) throw error;
      return data ? data.door_states : [];
    },
    // A re-read hands a fresh array of equal content; keeping the old one spares the occluders and light grids
    // memoised on its identity.
    structuralSharing: (old, next) => (Array.isArray(old) && Array.isArray(next) && sameDoorStates(old, next) ? old : next),
    enabled: () => !!toValue(campaignId) && !!toValue(placeId),
  });

  const doorStates = computed<readonly MapLiveDoorState[]>(() => {
    const data = query.data.value;
    return data && data.length > 0 ? data : NO_DOOR_STATES;
  });

  /** Sets one door open or shut, showing it at once; a refused write is read back and thrown. */
  async function setDoor(id: string, open: boolean): Promise<void> {
    const cid = toValue(campaignId);
    const pid = toValue(placeId);
    if (!cid || !pid) throw new Error("Cannot change a door without a campaign and a place");
    const cacheKey = ["map-doors", cid, pid] as const;
    queryClient.setQueryData<MapLiveDoorState[]>(cacheKey, (doors) => [...(doors ?? []).filter((d) => d.id !== id), { id, open }]);
    const { data, error } = await supabase.rpc("set_map_door", { p_campaign_id: cid, p_location_id: pid, p_door_id: id, p_open: open });
    if (error) {
      // What this screen showed early was never saved: read the row again rather than keep showing it.
      void queryClient.invalidateQueries({ queryKey: cacheKey });
      throw error;
    }
    queryClient.setQueryData<MapLiveDoorState[]>(cacheKey, data);
  }

  return { doorStates, setDoor };
}
