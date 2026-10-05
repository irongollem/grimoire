// ── One place a site's floor-plan data agrees with itself (#868, S6) ───────
//
// `AtlasPlacePane`'s readiness meter, its map-mode source strip, and its
// layer bar all need the same facts about a site — its bindable spaces, its
// traced regions, its door graph, and (when it has one) the Cartographer
// drawing it was last published from. Gathering each of those in three
// different places is how a readiness pill and a staleness strip end up
// disagreeing about the same site; this composable is the one place instead.
//
// Two tiers (#972, story 11). `useSiteStructure` is the core every place pane
// needs just to say what a site is made of: children, regions, doors,
// readiness. `useSiteMapExtras` is what only the Map tab's own chrome reads
// (publish staleness, the layer bar's tallies), and it pulls in the drawing,
// every prepared-material catalogue and the whole campaign's encounters.
// Selecting a place in Overview used to pay for all of it; now only a surface
// that shows those numbers mounts the second tier.

import { computed } from "vue";
import type { Ref } from "vue";
import { useLocations } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useSitePrepared } from "@/composables/locations/useSitePrepared";
import { bindableSpaces } from "@/lib/locations/tiers";
import { publishStaleness, siteReadiness, structureFromSite } from "@/lib/locations/siteReadiness";
import type { LocationSummary } from "@/types/location.types";

export function useSiteStructure(location: Ref<LocationSummary | null | undefined>) {
  const siteId = computed(() => location.value?.id ?? "");

  const childrenQuery = useLocations(siteId);
  const spaces = computed(() => bindableSpaces(childrenQuery.data.value ?? []));

  const regionsQuery = useLocationMapRegions(siteId);
  const regions = computed(() => regionsQuery.data.value ?? []);

  const spaceIds = computed(() => spaces.value.map((s) => s.id));
  const doorsQuery = useSiteDoors(spaceIds);
  const doors = computed(() => doorsQuery.data.value ?? []);

  const readiness = computed(() =>
    siteReadiness({
      siteType: location.value?.location_type,
      location: {
        map_url: location.value?.map_url ?? null,
        grid_calibration: location.value?.grid_calibration ?? null,
        map_layer_url: location.value?.map_layer_url ?? null,
        map_layer_calibration: location.value?.map_layer_calibration ?? null,
        plan_size: location.value?.plan_size ?? null,
      },
      spaces: spaces.value,
      regions: regions.value,
      doors: doors.value,
    }),
  );

  return { spaces, regions, doors, readiness };
}

/** What only the Map tab's chrome reads. Takes the core's result so the
 *  children, regions and doors are not gathered a second time. */
export function useSiteMapExtras(
  location: Ref<LocationSummary | null | undefined>,
  structure: Pick<ReturnType<typeof useSiteStructure>, "spaces" | "regions" | "doors">,
) {
  const { spaces, regions, doors } = structure;
  const spaceIds = computed(() => spaces.value.map((s) => s.id));

  // Prepared layer counts (#868, S8) — the same tally `useSitePrepared`
  // already gives the map's own layer bar; the pane's layer bar needs the
  // total, and the legend (frame 10) needs the per-kind breakdown.
  const { counts: preparedCounts } = useSitePrepared(spaceIds, regions);

  const sourceMapId = computed(() => location.value?.source_map_id ?? "");
  const sourceMapQuery = useDungeonMap(sourceMapId);

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
    sourceMap: sourceMapQuery,
    staleness,
    layerCounts,
    preparedCounts,
  };
}
