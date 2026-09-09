// Every prep-material placement across a site's spaces at once (#868, S10).
//
// `useLocationPlacements` reads one room; Publish to Atlas needs every trap
// and feature placement across every room (and nested site) a site holds, in
// one query, so `planPublish` can reconcile the whole structure in a single
// pass rather than one query per room. S8 (the next wave, room→site
// promotion for the Rooms panel itself) reuses this rather than each writing
// its own `.in()` query.

import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";

const QUERY_KEY = "location-placements";

async function fetchSitePlacements(spaceIds: readonly string[]): Promise<LocationPlacementWithEntity[]> {
  if (!spaceIds.length) return [];
  const { data, error } = await supabase
    .from("location_placements")
    .select(
      "*, trap:traps(id, name), dungeon_feature:dungeon_features(id, name), roll_table:roll_tables(id, name), loot_table:loot_tables(id, name)",
    )
    .in("location_id", spaceIds);
  if (error) throw error;
  return data as LocationPlacementWithEntity[];
}

/** Every placement across a site's bindable spaces — the reverse of scoping
 *  `useLocationPlacements` to one room. `spaceIds` is a site's bindable
 *  children (rooms and nested sites), same set `useSiteDoors` takes. */
export function useSitePlacements(spaceIds: Ref<string[]>) {
  // Sorted so the query key is stable across re-renders that reorder the same
  // space set — same reasoning as `useSiteDoors`.
  const sortedIds = computed(() => [...spaceIds.value].sort());
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "site", sortedIds.value]),
    queryFn: () => fetchSitePlacements(spaceIds.value),
    enabled: () => spaceIds.value.length > 0,
  });
}
