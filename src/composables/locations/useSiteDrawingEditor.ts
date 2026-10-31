// ── A site's Drawing, saved as it is edited (#884, S11) ─────────────────────
//
// The site flavour of `useDrawingAutosave`: the first edit of a site with no
// Drawing creates the `dungeon_maps` row and points `source_map_id` at it,
// the deferred half of `useOpenSiteDrawing`'s immediate "Draw one" click, for
// a DM who started painting without clicking that first.
//
// Takes the site's own drawing as `drawingMap` rather than querying it a
// second time: the host (`PlaceMapEditorView.vue`) already reads it off
// `useSiteMapExtras()`'s `sourceMap`, and TanStack Query would only dedupe
// the request, not the second composable instance subscribing to it.

import { computed, type ComputedRef } from "vue";
import { useDrawingAutosave } from "@/composables/locations/useDrawingAutosave";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { Location } from "@/types/location.types";

export type { SiteDrawingWorkbenchRef } from "@/composables/locations/useDrawingAutosave";

export function useSiteDrawingEditor(
  location: ComputedRef<Pick<Location, "id" | "name" | "source_map_id">>,
  drawingMap: ComputedRef<Pick<DungeonMap, "tags"> | null | undefined>,
) {
  const updateLocation = useUpdateLocation();
  return useDrawingAutosave({
    target: computed(() => ({ mapId: location.value.source_map_id, fallbackName: location.value.name })),
    tags: () => drawingMap.value?.tags ?? [],
    onCreated: async (mapId) => {
      await updateLocation.mutateAsync({ id: location.value.id, update: { source_map_id: mapId } });
    },
  });
}
