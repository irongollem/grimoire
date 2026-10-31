// Cartographer list filters.
import { defineStore } from "pinia";
import { useStorage, usePreferredReducedMotion } from "@vueuse/core";
import { ref, computed } from "vue";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { gridAlphaFor, type GridStrength } from "@/cartographer/gridStrength";

export const useCartographerUiStore = defineStore("ui:cartographer", () => {
  // Cartographer (map editor) — list filter state
  const cartographerSearch = ref("");
  const cartographerFilterPack = ref("");

  // The second tile set of each map, like Photoshop's background colour. Not a column: it is
  // the editor's working state (one swap away from the active set), not part of the map.
  const secondPackByMap = useStorage<Record<string, string>>("grimoire:cartographer-second-pack", {}, safeLocalStorage());

  // Motion button (#1125 frame 17): pauses water, sway and firelight while editing. A per-device convenience, so it
  // is remembered here and never saved with the map. Reduced motion keeps everything still whatever was stored.
  const motionPlaying = useStorage<boolean>("grimoire:cartographer-motion-playing", true, safeLocalStorage());
  const reducedMotion = usePreferredReducedMotion();
  const motionRunning = computed(() => motionPlaying.value && reducedMotion.value !== "reduce");

  // The square grid (Map Table frame 18): one switch and one strength for every tab, remembered per device.
  const gridShown = useStorage<boolean>("grimoire:cartographer-grid-shown", true, safeLocalStorage());
  const gridStrength = useStorage<GridStrength>("grimoire:cartographer-grid-strength", "faint", safeLocalStorage());
  const gridAlpha = computed(() => gridAlphaFor(gridShown.value, gridStrength.value));

  const cartographerHasActiveFilters = computed(() =>
    cartographerSearch.value !== "" || cartographerFilterPack.value !== "",
  );

  function resetCartographerFilters() {
    cartographerSearch.value = "";
    cartographerFilterPack.value = "";
  }

  return {
    cartographerSearch,
    cartographerFilterPack,
    secondPackByMap,
    motionPlaying,
    motionRunning,
    gridShown,
    gridStrength,
    gridAlpha,
    cartographerHasActiveFilters,
    resetCartographerFilters,
  };
});
