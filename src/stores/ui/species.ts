// Species list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSpeciesUiStore = defineStore("ui:species", () => {
  // Species UI state
  const speciesSearch = ref("");
  const speciesFilterSize = ref("all");
  const speciesFilterSource = ref("all");
  const speciesOpen5ePanelOpen = ref(false);

  const speciesHasActiveFilters = computed(
    () => speciesSearch.value !== "" || speciesFilterSize.value !== "all" || speciesFilterSource.value !== "all",
  );

  function resetSpeciesFilters() {
    speciesSearch.value = "";
    speciesFilterSize.value = "all";
    speciesFilterSource.value = "all";
  }

  return {
    speciesSearch,
    speciesFilterSize,
    speciesFilterSource,
    speciesOpen5ePanelOpen,
    speciesHasActiveFilters,
    resetSpeciesFilters,
  };
});
