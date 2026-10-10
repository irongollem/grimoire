// Custom Rules, Reliquary Compendium and Reliquary Manual filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useRulesUiStore = defineStore("ui:rules", () => {
  // Custom Rules UI state
  const customRulesSearch = ref("");
  const customRulesFilterCategory = ref("");

  const customRulesHasActiveFilters = computed(
    () => customRulesSearch.value !== "" || customRulesFilterCategory.value !== "",
  );

  function resetCustomRulesFilters() {
    customRulesSearch.value = "";
    customRulesFilterCategory.value = "";
  }

  // Reliquary → Compendium tab (library rules tree). The sidebar search is the
  // whole filter set, so hasActiveFilters is just "is there a query".
  const compendiumSearch = ref("");
  const compendiumHasActiveFilters = computed(() => compendiumSearch.value !== "");
  function resetCompendiumFilters() { compendiumSearch.value = ""; }

  // Reliquary → Manual tab
  const manualSearch = ref("");
  const manualHasActiveFilters = computed(() => manualSearch.value !== "");
  function resetManualFilters() { manualSearch.value = ""; }

  return {
    customRulesSearch,
    customRulesFilterCategory,
    customRulesHasActiveFilters,
    resetCustomRulesFilters,
    compendiumSearch,
    compendiumHasActiveFilters,
    resetCompendiumFilters,
    manualSearch,
    manualHasActiveFilters,
    resetManualFilters,
  };
});
