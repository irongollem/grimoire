// Deity filters and the Pantheons list search.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useDeitiesUiStore = defineStore("ui:deities", () => {
  // Deity (Pantheon) UI state
  const deitiesSearch = ref("");
  const deitiesFilterDomain = ref("");
  const deitiesFilterPantheon = ref("");

  const deitiesHasActiveFilters = computed(
    () => deitiesSearch.value !== "" || deitiesFilterDomain.value !== "" || deitiesFilterPantheon.value !== "",
  );

  function resetDeitiesFilters() {
    deitiesSearch.value = "";
    deitiesFilterDomain.value = "";
    deitiesFilterPantheon.value = "";
  }

  // Pantheons UI state — the pantheon *list* search (distinct from the
  // deities list, which uses deitiesSearch/deitiesFilterPantheon above).
  const pantheonsSearch = ref("");

  const pantheonsHasActiveFilters = computed(() => pantheonsSearch.value !== "");

  function resetPantheonsFilters() {
    pantheonsSearch.value = "";
  }

  return {
    deitiesSearch,
    deitiesFilterDomain,
    deitiesFilterPantheon,
    deitiesHasActiveFilters,
    resetDeitiesFilters,
    pantheonsSearch,
    pantheonsHasActiveFilters,
    resetPantheonsFilters,
  };
});
