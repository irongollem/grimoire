// ── A map editor's autosave (#884, S11; generalised #1125) ─────────────────
//
// `MapWorkbench` edits a drawing live, with no Save button to reach for. This
// composable is the host wiring both editors share, the site's full-screen
// map editor (`PlaceMapEditorView`, through `useSiteDrawingEditor`) and the
// standalone `/cartographer/:id`: it autosaves the drawing a short debounce
// after the workbench reports an edit, and creates the `dungeon_maps` row the
// first time a map with none gets painted on, then tells its host
// (`onCreated`) so the host can point at it: a site links `source_map_id`, the
// standalone page swaps `/cartographer/new` for the new id.
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
import { useToast } from "@/composables/useToast";
import type MapWorkbench from "@/components/cartographer/MapWorkbench.vue";
import type { DungeonMap } from "@/types/dungeonMap.types";

/** Long enough that a DM's ordinary pause between strokes doesn't fire a
 *  save mid-gesture, short enough that a save is never far behind. */
const AUTOSAVE_DEBOUNCE_MS = 1500;

export type SiteDrawingWorkbenchRef = InstanceType<typeof MapWorkbench> | null;

export interface DrawingTarget {
  /** The row to update; null until the first edit creates one. */
  mapId: string | null;
  /** The name a map takes when its name field is blank. */
  fallbackName: string;
}

export function useDrawingAutosave(options: {
  target: ComputedRef<DrawingTarget>;
  tags: () => DungeonMap["tags"];
  /** Runs once, right after a first edit created the row. */
  onCreated: (mapId: string) => Promise<void>;
}) {
  const { target, tags, onCreated } = options;
  const { error: toastError, fromError } = useToast();

  const createMap = useCreateDungeonMap();
  const updateMap = useUpdateDungeonMap();

  const workbenchRef = shallowRef<SiteDrawingWorkbenchRef>(null);
  /** The row this composable created, kept so a later save updates it even
   *  while the host is still catching up (a failed link must not make the
   *  next save create a second map). Hosts also read it to skip re-seeding the
   *  workbench from a row it already holds. */
  const createdMapId = ref<string | null>(null);
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
        name: wb.getName().trim() || target.value.fallbackName,
        description: null,
        layers: wb.getLayers(),
        metadata: wb.getMetadata(),
        default_pack_id: wb.getCurrentPackId(),
        darkness: wb.getDarkness(),
        tags: tags(),
        notes: null as unknown,
        campaign_id: wb.getCampaignId(),
      };
      const mapId = target.value.mapId ?? createdMapId.value;
      if (mapId) {
        await updateMap.mutateAsync({ id: mapId, update: payload });
      } else {
        const created = await createMap.mutateAsync(payload);
        createdMapId.value = created.id;
        await onCreated(created.id);
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

  return { workbenchRef, dirty, saving, createdMapId, onDirtyChange, onEditRevision, save, flush };
}
