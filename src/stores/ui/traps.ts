// Traproom list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useTrapsUiStore = defineStore("ui:traps", () => {
  // Traps (Traproom) UI state
  const trapsSearch = ref("");
  const trapsFilterType = ref("");

  const trapsHasActiveFilters = computed(
    () => trapsSearch.value !== "" || trapsFilterType.value !== "",
  );

  function resetTrapsFilters() {
    trapsSearch.value = "";
    trapsFilterType.value = "";
  }

  return {
    trapsSearch,
    trapsFilterType,
    trapsHasActiveFilters,
    resetTrapsFilters,
  };
});
