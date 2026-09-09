import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { LocationDoor } from "@/types/locationDoor.types";
import type { LocationType } from "@/types/location.types";

const QUERY_KEY = "site-doors";

/**
 * A door joined to both endpoints' names and type (#868) — the shape the
 * site-wide "Ways out" panel (`SiteWaysOutPanel.vue`) reads to render
 * `doorTitle`/`doorSubtitle` without a second query, and that
 * `reachableRoomIds` still reads structurally as a plain `LocationDoor`.
 */
export interface SiteDoorWithSpaces extends LocationDoor {
  from_location: { id: string; name: string; location_type: LocationType } | null;
  to_location: { id: string; name: string; location_type: LocationType } | null;
}

/**
 * Every door with an origin among `spaceIds`. `useLocationDoors` (#785)
 * fetches one room's ways out from that room's own point of view, which is
 * the right shape for the room-level panel but not enough to ask "can the
 * party reach room X from room Y" across a whole site, or to list every one
 * of a site's doors at once (#868) — both need the site's full door graph.
 *
 * `spaceIds` is a site's bindable spaces — rooms AND nested sites (#868
 * widened the endpoint guard from "two rooms" to "two bindable spaces
 * sharing a parent"), since a stair may originate from a nested site (a
 * `grounds` courtyard) rather than a room.
 *
 * Filtering on `from_location_id` alone is sufficient, not merely convenient:
 * `location_doors_endpoint_guard` already requires both ends of a door to be
 * bindable spaces sharing one parent, so any row whose origin is a space of
 * this site necessarily has its destination inside the site too — a second
 * `.in()` on `to_location_id` would only re-check what the database already
 * enforces.
 */
async function fetchSiteDoors(spaceIds: readonly string[]): Promise<SiteDoorWithSpaces[]> {
  if (!spaceIds.length) return [];
  const { data, error } = await supabase
    .from("location_doors")
    .select(
      "*, from_location:locations!from_location_id(id, name, location_type), to_location:locations!to_location_id(id, name, location_type)",
    )
    .in("from_location_id", spaceIds);
  if (error) throw error;
  return data as SiteDoorWithSpaces[];
}

export function useSiteDoors(spaceIds: Ref<string[]>) {
  // Sorted so the query key is stable across re-renders that reorder the same
  // space set — same reasoning as `useLocationStateForRooms`.
  const sortedIds = computed(() => [...spaceIds.value].sort());
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, sortedIds.value]),
    queryFn: () => fetchSiteDoors(spaceIds.value),
    enabled: () => spaceIds.value.length > 0,
  });
}
