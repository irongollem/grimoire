// Faction list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useFactionsUiStore = defineStore("ui:factions", () => {
  // Faction UI state
  const factionsSearch = ref("");
  const factionsFilterType = ref("");

  const factionsHasActiveFilters = computed(
    () => factionsSearch.value !== "" || factionsFilterType.value !== "",
  );

  function resetFactionsFilters() {
    factionsSearch.value = "";
    factionsFilterType.value = "";
  }

  return {
    factionsSearch,
    factionsFilterType,
    factionsHasActiveFilters,
    resetFactionsFilters,
  };
});
