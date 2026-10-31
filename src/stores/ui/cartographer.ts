// Cartographer list filters.
import { defineStore } from "pinia";
import { useStorage } from "@vueuse/core";
import { ref, computed } from "vue";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

export const useCartographerUiStore = defineStore("ui:cartographer", () => {
  // Cartographer (map editor) — list filter state
  const cartographerSearch = ref("");
  const cartographerFilterPack = ref("");

  // The second tile set of each map, like Photoshop's background colour. Not a column: it is
  // the editor's working state (one swap away from the active set), not part of the map.
  const secondPackByMap = useStorage<Record<string, string>>("grimoire:cartographer-second-pack", {}, safeLocalStorage());

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
    cartographerHasActiveFilters,
    resetCartographerFilters,
  };
});
