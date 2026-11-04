// What the drawing means, live (#868).
//
// `structure.ts` derives a `DerivedStructure` from a `DungeonMap` — pure and
// framework-free. This composable is the seam between that pure model and
// the editor: the reactive derivation Publish and the ready check read, and
// the "changed since last publish" caution. Rooms are picked and named on the
// Zoning tab, so nothing here selects or renames a space.

import { computed, type Ref } from "vue";
import type { CellKey, CellMetadata, DungeonMap, DungeonMapLayers } from "@/types/dungeonMap.types";
import { deriveStructure, structureDelta } from "@/cartographer/structure";

// ── The composable ──────────────────────────────────────────────────────────

export function useCartographerStructure(
  layers: Ref<DungeonMapLayers>,
  metadata: Ref<Record<CellKey, CellMetadata>>,
  loadedMap: Ref<DungeonMap | null | undefined>,
) {
  const structure = computed(() => deriveStructure({ layers: layers.value, metadata: metadata.value }));
  // The structure as of the map's own last-loaded/last-saved layers, for the
  // "N regions changed since last publish" caution. `loadedMap` is the
  // TanStack Query cache entry — it only moves on load/save, never per
  // keystroke, so this is exactly "as of last save", not "as of last publish"
  // (there is no separate publish-time snapshot to derive from yet).
  const publishedStructure = computed(() =>
    loadedMap.value ? deriveStructure({ layers: loadedMap.value.layers, metadata: loadedMap.value.metadata }) : null,
  );
  const changedSinceLastPublish = computed(() => {
    if (!publishedStructure.value) return null;
    const delta = structureDelta(publishedStructure.value, structure.value);
    return { ...delta, total: delta.changedSpaces + delta.newSpaces + delta.goneSpaces };
  });

  return {
    structure,
    changedSinceLastPublish,
  };
}
