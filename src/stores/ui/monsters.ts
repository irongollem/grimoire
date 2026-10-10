// Monster list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useMonstersUiStore = defineStore("ui:monsters", () => {
  // Monster UI state
  const monstersSearch = ref("");
  const monstersFilterType = ref("all");
  const monstersFilterSource = ref("all");
  const monsterGeneratorOpen = ref(false);

  const monstersHasActiveFilters = computed(() =>
    monstersSearch.value !== "" ||
    monstersFilterType.value !== "all" ||
    monstersFilterSource.value !== "all",
  );

  function resetMonstersFilters() {
    monstersSearch.value = "";
    monstersFilterType.value = "all";
    monstersFilterSource.value = "all";
  }

  return {
    monstersSearch,
    monstersFilterType,
    monstersFilterSource,
    monstersHasActiveFilters,
    resetMonstersFilters,
    monsterGeneratorOpen,
  };
});
