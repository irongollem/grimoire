// The map's own document state: its name, scope, layers, metadata, light and pack, the dirty flag and edit
// counter the host autosaves from, and (re)loading all of it from the `map` row. Split out of MapWorkbench.vue (#1135).

import { ref, watch, type ComputedRef, type Ref } from "vue";
import { readLayers } from "@/cartographer/areaToWalls";
import {
  emptyLayers, type CellKey, type CellMetadata, type DarknessLevel, type DungeonMap, type DungeonMapLayers,
} from "@/types/dungeonMap.types";

export function useWorkbenchDocument(inputs: {
  defaultName: string;
  activeCampaignId: ComputedRef<string | null>;
  currentPackId: Ref<string>;
  firstPublishedPackId: Ref<string | null>;
  getMap: () => DungeonMap | null | undefined;
  emits: { dirty: (dirty: boolean) => void; editRevision: (revision: number) => void };
}) {
  const { defaultName, activeCampaignId, currentPackId, firstPublishedPackId, getMap, emits } = inputs;

  const name = ref(defaultName);
  // NULL = available in every campaign; new maps default to the active
  // campaign, existing ones keep whatever scope they already have (#789) — the
  // watch below overwrites this from the loaded map's own campaign_id.
  const campaignId = ref<string | null>(activeCampaignId.value);
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const darkness = ref<DarknessLevel>("daylight");
  const dirty = ref(false);
  watch(dirty, (v) => emits.dirty(v), { immediate: true });

  // Bumped on every edit, not just the false→true `dirty` transition — see
  // `useMapCanvasEditor.ts`'s `editRevision` docblock for why the host's
  // autosave (`useSiteDrawingEditor`) needs this to notice a stroke made while
  // `dirty` was already `true` (#884 review finding 1).
  const editRevision = ref(0);
  watch(editRevision, (rev) => emits.editRevision(rev));
  /** The setters below (link/annotation) aren't routed through
   *  `useMapCanvasEditor`'s own `markDirty()`, so they bump this directly. */
  function markDirty(): void {
    dirty.value = true;
    editRevision.value++;
  }

  /** The map's name, edited in the host's bar. A rename is an unsaved change like a stroke. */
  function setName(next: string): void {
    if (name.value === next) return;
    name.value = next;
    markDirty();
  }

  /** The Light control: a map-wide setting that, like a stroke, is an unsaved change (and re-arms the site's autosave). */
  function setDarkness(level: DarknessLevel): void {
    if (darkness.value === level) return;
    darkness.value = level;
    markDirty();
  }

  // M4 — Map metadata (entity links), lives alongside layers
  const metadata = ref<Record<CellKey, CellMetadata>>({});

  function cloneLayers(src: DungeonMapLayers | null | undefined): DungeonMapLayers {
    if (!src) return emptyLayers();
    // JSON round-trip — layers are pure data, and this strips Vue's readonly proxy
    // wrapping that comes off TanStack Query's cached result so the editor owns a
    // writable copy.
    return readLayers(JSON.parse(JSON.stringify(src)) as Partial<DungeonMapLayers>, { newKey: () => crypto.randomUUID() });
  }

  /** (Re)initializes every editable field from `m` — the `map` prop's watcher,
   *  and `resetEdits()`'s implementation for Cancel. */
  function applyMapToState(m: DungeonMap | null): void {
    if (m) {
      name.value = m.name;
      campaignId.value = m.campaign_id;
      darkness.value = m.darkness;
      layers.value = cloneLayers(m.layers);
      metadata.value = JSON.parse(JSON.stringify(m.metadata ?? {})) as Record<CellKey, CellMetadata>;
      // Neither present means the library has not answered yet; keep whatever
      // is there and let the `firstPublishedPackId` watch above resolve it.
      currentPackId.value = m.default_pack_id ?? firstPublishedPackId.value ?? currentPackId.value;
    }
    dirty.value = false;
  }

  /** Cancel — discard in-progress edits, restore the last-loaded `map` prop. */
  function resetEdits(): void {
    applyMapToState(getMap() ?? null);
  }

  /** Called by the host once its Save mutation resolves. */
  function markSaved(): void {
    dirty.value = false;
  }

  return {
    name, campaignId, layers, metadata, darkness, dirty, editRevision,
    markDirty, setName, setDarkness, applyMapToState, resetEdits, markSaved,
  };
}
