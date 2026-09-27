import { computed, type ComputedRef } from "vue";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { drawnSpaceIds, levelsOf, NO_PLANS, type LevelsInfo } from "@/lib/locations/levels";
import type { AtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

/**
 * A site's levels as every surface should read them: `levelsOf` with the
 * plans it needs. The container is either the place itself or its parent, so
 * both their regions are read; a nested site either one draws as a space is
 * a place on that floor, not a level. One composable so the rail, the Build
 * picker, the "N levels" line and the level chips cannot disagree.
 */
export function useSiteLevels(
  location: () => Location | null,
  index: () => AtlasIndex,
): ComputedRef<LevelsInfo | null> {
  const ownId = computed(() => location()?.id ?? "");
  const parentId = computed(() => location()?.parent_id ?? "");
  const { data: ownRegions } = useLocationMapRegions(ownId);
  const { data: parentRegions } = useLocationMapRegions(parentId);

  return computed(() => {
    const place = location();
    if (!place) return null;
    // Regions still loading read as "nothing drawn yet": the list may show a
    // shop as a level for the moment it takes, never hide a real floor.
    const drawn = new Map<string, ReadonlySet<string>>();
    if (ownRegions.value) drawn.set(ownId.value, drawnSpaceIds(ownRegions.value));
    if (parentRegions.value) drawn.set(parentId.value, drawnSpaceIds(parentRegions.value));
    return levelsOf(index(), place, (siteId) => drawn.get(siteId) ?? NO_PLANS(siteId));
  });
}
