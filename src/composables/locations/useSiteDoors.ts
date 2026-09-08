import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { LocationDoor } from "@/types/locationDoor.types";

const QUERY_KEY = "site-doors";

/**
 * Every door with an origin among `roomIds`. `useLocationDoors` (#785) fetches
 * one room's ways out from that room's own point of view, which is the right
 * shape for the "Ways out" panel but not enough to ask "can the party reach
 * room X from room Y" across a whole site — that needs the site's full door
 * graph, feeding `lib/locations/siteRun.ts`'s `reachableRoomIds` (#791, epic
 * #780).
 *
 * Filtering on `from_location_id` alone is sufficient, not merely convenient:
 * `location_doors_endpoint_guard` already requires both ends of a door to be
 * rooms sharing one parent, so any row whose origin is a room of this site
 * necessarily has its destination inside the site too — a second `.in()` on
 * `to_location_id` would only re-check what the database already enforces.
 */
async function fetchSiteDoors(roomIds: readonly string[]): Promise<LocationDoor[]> {
  if (!roomIds.length) return [];
  const { data, error } = await supabase.from("location_doors").select("*").in("from_location_id", roomIds);
  if (error) throw error;
  return data as LocationDoor[];
}

export function useSiteDoors(roomIds: Ref<string[]>) {
  // Sorted so the query key is stable across re-renders that reorder the same
  // room set — same reasoning as `useLocationStateForRooms`.
  const sortedIds = computed(() => [...roomIds.value].sort());
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, sortedIds.value]),
    queryFn: () => fetchSiteDoors(roomIds.value),
    enabled: () => roomIds.value.length > 0,
  });
}
