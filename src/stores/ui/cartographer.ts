// Cartographer list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useCartographerUiStore = defineStore("ui:cartographer", () => {
  // Cartographer (map editor) — list filter state
  const cartographerSearch = ref("");
  const cartographerFilterPack = ref("");

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
    cartographerHasActiveFilters,
    resetCartographerFilters,
  };
});
