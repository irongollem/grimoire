// ── One place a site's floor-plan data agrees with itself (#868, S6) ───────
//
// `AtlasPlacePane`'s readiness meter, its map-mode source strip, and its
// layer bar all need the same facts about a site — its bindable spaces, its
// traced regions, its door graph, and (when it has one) the Cartographer
// drawing it was last published from. Gathering each of those in three
// different places is how a readiness pill and a staleness strip end up
// disagreeing about the same site; this composable is the one place instead.

import { computed } from "vue";
import type { Ref } from "vue";
import { useLocations } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useDoorStateForSite } from "@/composables/locations/useLocationState";
import { useDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useSitePrepared } from "@/composables/locations/useSitePrepared";
import { bindableSpaces } from "@/lib/locations/tiers";
import { publishStaleness, siteReadiness, structureFromSite } from "@/lib/locations/siteReadiness";
import type { Location } from "@/types/location.types";

export function useSiteStructure(location: Ref<Location | null | undefined>) {
  const siteId = computed(() => location.value?.id ?? "");

  const childrenQuery = useLocations(siteId);
  const spaces = computed(() => bindableSpaces(childrenQuery.data.value ?? []));

  const regionsQuery = useLocationMapRegions(siteId);
  const regions = computed(() => regionsQuery.data.value ?? []);

  const spaceIds = computed(() => spaces.value.map((s) => s.id));
  const doorsQuery = useSiteDoors(spaceIds);
  const doors = computed(() => doorsQuery.data.value ?? []);

  const doorState = useDoorStateForSite(siteId);

  // Prepared layer counts (#868, S8) — the same tally `useSitePrepared`
  // already gives the map's own layer bar; the pane's layer bar needs the
  // total, and the legend (frame 10) needs the per-kind breakdown.
  const { counts: preparedCounts } = useSitePrepared(spaceIds, regions);

  const sourceMapId = computed(() => location.value?.source_map_id ?? "");
  const sourceMapQuery = useDungeonMap(sourceMapId);

  const readiness = computed(() =>
    siteReadiness({
      location: {
        map_url: location.value?.map_url ?? null,
        grid_calibration: location.value?.grid_calibration ?? null,
      },
      spaces: spaces.value,
      regions: regions.value,
      doors: doors.value,
    }),
  );

  /** Null when there is no source map, or the last publish already carries
   *  the drawing's current rev — the fresh state the source strip renders. */
  const staleness = computed(() => {
    const loc = location.value;
    if (!loc?.source_map_id) return null;
    const before = structureFromSite(regions.value, doors.value);
    return publishStaleness({ map_published_rev: loc.map_published_rev }, sourceMapQuery.data.value, before);
  });

  const layerCounts = computed(() => ({
    spaces: spaces.value.length,
    ways: doors.value.length,
    zones: regions.value.filter((r) => r.region_role === "zone").length,
    prepared: Object.values(preparedCounts.value).reduce((sum, n) => sum + n, 0),
  }));

  return {
    spaces,
    regions,
    doors,
    doorState,
    sourceMap: sourceMapQuery,
    readiness,
    staleness,
    layerCounts,
    preparedCounts,
  };
}
