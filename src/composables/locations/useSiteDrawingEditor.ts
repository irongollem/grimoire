// ── The embedded Drawing's own save path (#884, S11) ────────────────────────
//
// `MapWorkbench` mounted in the Atlas's Build mode edits a site's Drawing
// live, same as its Plan palette writes `location_map_regions`/
// `location_doors` on every gesture — there is no separate route with its
// own Save button to reach for any more (`CartographerEditorView.vue` still
// has one, for the standalone `/cartographer/:id`). So this composable is
// that host wiring: it autosaves the Drawing a short debounce after the
// workbench reports an edit, and creates the `dungeon_maps` row (and points
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
//
// ── Two data-loss holes closed here (#884 review finding 1) ────────────────
//
// 1. An edit made while a save is already in flight used to go unsaved: the
//    debounce only re-armed off `MapWorkbench`'s `update:dirty`, which fires
//    once on the false→true edge and never again while `dirty` stays `true`
//    — so a second stroke during the same dirty span scheduled nothing.
//    `MapWorkbench` now also emits `update:editRevision` on every single
//    edit (see its own docblock), and `onEditRevision` below re-arms the
//    debounce every time, not just on the first edit. `save()` also compares
//    the edit revision it read the payload at against the revision once the
//    mutation resolves — if they differ, something changed mid-flight, so it
//    leaves `dirty` set and re-arms instead of calling `markSaved()`.
// 2. A pending debounced save used to be dropped outright on navigate-away —
//    nothing ever flushed it. `flush()` exists for the hosts' own
//    `onBeforeUnmount`/`onBeforeRouteLeave` to call.

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

  function armDebounce(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
  }

  function disarmDebounce(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }

  /** Saves the workbench's current layers/metadata. Reads `getEditRevision()`
   *  before building the payload and again once the mutation resolves — if
   *  they still match, nothing changed while this save was in flight and
   *  it's safe to clear `dirty`; if they don't, an edit landed mid-save and
   *  would otherwise be silently marked saved along with it, so `dirty`
   *  stays set and the debounce re-arms instead (#884 review finding 1). */
  async function save(): Promise<void> {
    const wb = workbenchRef.value;
    if (!wb || !dirty.value || saving.value) return;
    saving.value = true;
    const revisionAtStart = wb.getEditRevision();
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
      if (wb.getEditRevision() === revisionAtStart) {
        dirty.value = false;
        disarmDebounce();
        wb.markSaved();
      } else {
        armDebounce();
      }
    } catch (e) {
      toastError(fromError(e));
    } finally {
      saving.value = false;
    }
  }

  /** Wired to `MapWorkbench`'s `@update:dirty` — mirrors the flag. Arming the
   *  debounce off the false→true edge here would miss every edit after the
   *  first (`dirty` doesn't change again while already `true`), which is
   *  exactly #884 review finding 1 — `onEditRevision` below is what actually
   *  re-arms it, on every edit. This still needs to mirror `false`: a reload
   *  of the `map` prop (Cancel, or another session's write landing) resets
   *  `dirty` locally without an edit ever happening. */
  function onDirtyChange(next: boolean): void {
    dirty.value = next;
    if (!next) disarmDebounce();
  }

  /** Wired to `MapWorkbench`'s `@update:editRevision` — fires on every single
   *  edit, unlike `update:dirty`. Re-arms the debounce unconditionally so a
   *  stroke made while a previous save is still in flight is never left with
   *  nothing scheduled to save it (#884 review finding 1). */
  function onEditRevision(): void {
    dirty.value = true;
    armDebounce();
  }

  /** Cancels any pending debounce and, if there's unsaved work, saves it
   *  immediately. Called from the hosts' own `onBeforeUnmount` and
   *  `onBeforeRouteLeave` so a stroke made in the last
   *  `AUTOSAVE_DEBOUNCE_MS` before navigating away isn't silently dropped
   *  (#884 review finding 1) — `save()` above already toasts on failure, so
   *  a failed teardown save still tells the DM rather than going quiet. */
  async function flush(): Promise<void> {
    disarmDebounce();
    if (dirty.value) await save();
  }

  return { workbenchRef, dirty, saving, onDirtyChange, onEditRevision, save, flush };
}
