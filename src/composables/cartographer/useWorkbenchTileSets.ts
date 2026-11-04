// The second tile set, one X from the active one (kept per map in the cartographer UI store), and what the
// rail's tile-set squares show. Split out of MapWorkbench.vue (#1135).

import { computed, type ComputedRef, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useCartographerUiStore } from "@/stores/ui/cartographer";
import type { EditorLayer } from "@/cartographer/keymap";
import type { TilePackRuntime } from "@/cartographer/packLoader";

export function useWorkbenchTileSets(inputs: {
  mapId: () => string | undefined;
  selectablePacks: ComputedRef<ReadonlyArray<{ pack_id: string; pack_version: number; name: string }>>;
  currentPackId: Ref<string>;
  loadedRuntimes: Ref<Map<string, TilePackRuntime>>;
  packRuntime: ComputedRef<TilePackRuntime | null>;
  activeLayer: Ref<EditorLayer>;
}) {
  const { mapId, selectablePacks, currentPackId, loadedRuntimes, packRuntime, activeLayer } = inputs;
  // Until one is chosen the second set is the first other set on offer.
  const { secondPackByMap } = storeToRefs(useCartographerUiStore());
  const secondPackId = computed<string | null>(() => {
    const stored = secondPackByMap.value[mapId() || "new"];
    const offered = selectablePacks.value.filter((p) => p.pack_id !== currentPackId.value);
    return offered.find((p) => p.pack_id === stored)?.pack_id ?? offered[0]?.pack_id ?? null;
  });
  function setSecondPack(id: string): void {
    secondPackByMap.value = { ...secondPackByMap.value, [mapId() || "new"]: id };
  }
  function swapTileSets(): void {
    // Only the Drawing paints tiles; the rail shows no swatches on the other tabs, so X has nothing to swap there.
    if (activeLayer.value !== "drawing") return;
    const second = secondPackId.value;
    if (second === null) return;
    setSecondPack(currentPackId.value);
    currentPackId.value = second;
  }

  /** What the rail's tile-set squares show; only the Drawing layer paints tiles. */
  const tileSetForRail = computed(() => ({
    packs: selectablePacks.value,
    currentPackId: currentPackId.value,
    secondPackId: secondPackId.value,
    runtimes: loadedRuntimes.value,
    validationMissing: packRuntime.value?.validation.missing.length ?? 0,
  }));

  return { setSecondPack, swapTileSets, tileSetForRail };
}
