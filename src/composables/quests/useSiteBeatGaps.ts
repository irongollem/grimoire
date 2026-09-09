// Site readiness for every site a quest's beats are staged at (#868, S12,
// frame 15) — "the Quest Board already renders `has-gaps` on a beat missing
// its people or its handouts. A site that cannot be walked is the same class
// of gap." `useSiteStructure` already answers this for ONE site at a time
// (`AtlasPlacePane`'s readiness meter); a quest's story flow can have several
// beats staged at several different sites at once, and mounting one
// `useSiteStructure` per site would open a query per site every time the
// canvas re-renders. This batches all of it into one regions query and one
// doors query instead, keyed on the whole set of staged sites.

import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { bindableSpaces } from "@/lib/locations/tiers";
import { siteReadiness } from "@/lib/locations/siteReadiness";
import type { SiteReadiness } from "@/lib/locations/siteReadiness";
import type { Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LocationDoor } from "@/types/locationDoor.types";

// Keyed under the same roots `useLocationMapRegions`/`useSiteDoors` use
// (`["location-map-regions", ...]` / `["site-doors", ...]`), not a private
// name — binding a room or publishing a map invalidates those prefixes, and
// a batched query under its own key would never see either invalidation,
// leaving this gap stale (#868 wave-4 fix).
const REGIONS_QUERY_KEY = "location-map-regions";
const DOORS_QUERY_KEY = "site-doors";

async function fetchRegionsForSites(siteIds: readonly string[]): Promise<LocationMapRegion[]> {
  if (!siteIds.length) return [];
  const { data, error } = await supabase.from("location_map_regions").select("*").in("site_location_id", siteIds);
  if (error) throw error;
  return data as LocationMapRegion[];
}

async function fetchDoorsFromSpaces(spaceIds: readonly string[]): Promise<LocationDoor[]> {
  if (!spaceIds.length) return [];
  // `from_location_id` alone is sufficient — same reasoning as
  // `useSiteDoors`: the endpoint guard already requires both ends of a door
  // to share a parent, so a door originating in one of these spaces can only
  // land inside that space's own site.
  const { data, error } = await supabase.from("location_doors").select("*").in("from_location_id", spaceIds);
  if (error) throw error;
  return data as LocationDoor[];
}

/** Each site's own bindable spaces (rooms and nested sites) — exported and
 *  pure so the grouping this composable does around `siteReadiness` can be
 *  tested without faking `useQuery` reactivity for two batched queries. */
export function bindableSpaceIdsBySite(siteIds: readonly string[], locations: readonly Location[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const siteId of siteIds) {
    const children = locations.filter((location) => location.parent_id === siteId);
    map.set(siteId, bindableSpaces(children).map((space) => space.id));
  }
  return map;
}

/** One `siteReadiness` per site, sliced out of the campaign-wide regions/doors
 *  rows the batched queries return. A site with no matching location (data
 *  still loading) is simply absent — never a fabricated all-unready result. */
export function deriveReadinessBySite(
  siteIds: readonly string[],
  locations: readonly Location[],
  regions: readonly LocationMapRegion[],
  doors: readonly LocationDoor[],
): Record<string, SiteReadiness> {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const spaceIdsBySite = bindableSpaceIdsBySite(siteIds, locations);
  const result: Record<string, SiteReadiness> = {};
  for (const siteId of siteIds) {
    const location = locationById.get(siteId);
    if (!location) continue;
    const spaceIds = new Set(spaceIdsBySite.get(siteId) ?? []);
    result[siteId] = siteReadiness({
      location: { map_url: location.map_url, grid_calibration: location.grid_calibration },
      spaces: [...spaceIds].map((id) => ({ id })),
      regions: regions.filter((region) => region.site_location_id === siteId),
      doors: doors.filter((door) => spaceIds.has(door.from_location_id)),
    });
  }
  return result;
}

/**
 * `siteIds` — the distinct `staged_at_location_id`s a quest's beats currently
 * hold, already filtered down to actual site-tier locations by the caller.
 * `locations` — the campaign's own location list (the caller already has
 * this for the `site · N rooms` fact `QuestBeatSiteInput` carries), read here
 * only for each site's own `map_url`/`grid_calibration` and its children.
 */
export function useSiteBeatGaps(siteIds: Ref<string[]>, locations: Ref<Location[]>) {
  const sortedSiteIds = computed(() => [...new Set(siteIds.value)].sort());
  const allSpaceIds = computed(() => [...bindableSpaceIdsBySite(sortedSiteIds.value, locations.value).values()].flat().sort());

  const regionsQuery = useQuery({
    queryKey: computed(() => [REGIONS_QUERY_KEY, "sites", sortedSiteIds.value]),
    queryFn: () => fetchRegionsForSites(sortedSiteIds.value),
    enabled: () => sortedSiteIds.value.length > 0,
  });
  const doorsQuery = useQuery({
    queryKey: computed(() => [DOORS_QUERY_KEY, "sites", allSpaceIds.value]),
    queryFn: () => fetchDoorsFromSpaces(allSpaceIds.value),
    enabled: () => allSpaceIds.value.length > 0,
  });

  const readinessBySite = computed<Record<string, SiteReadiness>>(() =>
    deriveReadinessBySite(sortedSiteIds.value, locations.value, regionsQuery.data.value ?? [], doorsQuery.data.value ?? []));

  return { readinessBySite };
}
