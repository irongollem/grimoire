// ── The embedded Drawing's own save path (#884, S11) ────────────────────────
//
// `MapWorkbench` mounted in the Atlas's Build mode edits a site's Drawing
// live, same as its Plan palette writes `location_map_regions`/
// `location_doors` on every gesture — there is no separate route with its
// own Save button to reach for any more (`CartographerEditorView.vue` still
// has one, for the standalone `/cartographer/:id`). So this composable is
// that host wiring: it autosaves the Drawing a short debounce after the
// workbench reports `dirty`, and creates the `dungeon_maps` row (and points
// `source_map_id` at it) the first time a site with none gets painted on —
// the deferred half of `useOpenSiteDrawing`'s immediate "Start drawing"
// click, for a DM who started painting without clicking that first.
//
// Takes the site's own drawing as `drawingMap` rather than querying it a
// second time — both hosts (`AtlasSiteMapMode.vue`, `LocationSheet.vue`)
// already read it off `useSiteStructure()`'s own `sourceMap` for the Layers
// panel, and TanStack Query would only dedupe the request, not the second
// composable instance subscribing to it.
//
// `AtlasSiteMapMode.vue` and `LocationSheet.vue` are the two hosts that
// mount `MapWorkbench` this way; both build one of these off the same
// `location`/`drawingMap` rather than duplicating the save/create branch a
// third time (the same component-extraction rule `useOpenSiteDrawing.ts`
// already documents).

import { ref, shallowRef, type ComputedRef } from "vue";
import { useCreateDungeonMap, useUpdateDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import type MapWorkbench from "@/components/cartographer/MapWorkbench.vue";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { Location } from "@/types/location.types";

/** Long enough that a DM's ordinary pause between strokes doesn't fire a
 *  save mid-gesture, short enough that a save is never far behind. */
const AUTOSAVE_DEBOUNCE_MS = 1500;

export type SiteDrawingWorkbenchRef = InstanceType<typeof MapWorkbench> | null;

export function useSiteDrawingEditor(
  location: ComputedRef<Pick<Location, "id" | "name" | "source_map_id">>,
  drawingMap: ComputedRef<Pick<DungeonMap, "tags"> | null | undefined>,
) {
  const { error: toastError, fromError } = useToast();

  const createMap = useCreateDungeonMap();
  const updateMap = useUpdateDungeonMap();
  const updateLocation = useUpdateLocation();

  const workbenchRef = shallowRef<SiteDrawingWorkbenchRef>(null);
  const dirty = ref(false);
  const saving = ref(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  async function save(): Promise<void> {
    const wb = workbenchRef.value;
    if (!wb || !dirty.value || saving.value) return;
    saving.value = true;
    try {
      const payload = {
        name: wb.getName().trim() || location.value.name,
        description: null,
        layers: wb.getLayers(),
        metadata: wb.getMetadata(),
        default_pack_id: wb.getCurrentPackId(),
        tags: drawingMap.value?.tags ?? [],
        notes: null as unknown,
        campaign_id: wb.getCampaignId(),
      };
      const sourceMapId = location.value.source_map_id;
      if (sourceMapId) {
        await updateMap.mutateAsync({ id: sourceMapId, update: payload });
      } else {
        const created = await createMap.mutateAsync(payload);
        await updateLocation.mutateAsync({ id: location.value.id, update: { source_map_id: created.id } });
      }
      wb.markSaved();
    } catch (e) {
      toastError(fromError(e));
    } finally {
      saving.value = false;
    }
  }

  /** Wired to `MapWorkbench`'s `@update:dirty` — arms (or, on the trailing
   *  `false` a successful `markSaved()` itself produces, disarms) the
   *  autosave debounce. */
  function onDirtyChange(next: boolean): void {
    dirty.value = next;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (next) debounceTimer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
  }

  return { workbenchRef, dirty, saving, onDirtyChange, save };
}
