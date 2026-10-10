// Encounter list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useEncountersUiStore = defineStore("ui:encounters", () => {
  // Encounter UI state
  const encountersSearch = ref("");
  const encountersHideFinished = ref(true);
  const encountersFilterQuestId = ref<"all" | "unassigned" | string>("all");

  const encountersHasActiveFilters = computed(
    () => encountersSearch.value !== "" || !encountersHideFinished.value || encountersFilterQuestId.value !== "all",
  );

  function resetEncountersFilters() {
    encountersSearch.value = "";
    encountersHideFinished.value = true;
    encountersFilterQuestId.value = "all";
  }

  return {
    encountersSearch,
    encountersHideFinished,
    encountersFilterQuestId,
    encountersHasActiveFilters,
    resetEncountersFilters,
  };
});
