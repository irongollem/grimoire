// Enigmarium list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const usePuzzlesUiStore = defineStore("ui:puzzles", () => {
  // Puzzles (Enigmarium) UI state
  const puzzlesSearch = ref("");
  const puzzlesFilterType = ref("");
  const puzzlesFilterDifficulty = ref("");

  const puzzlesHasActiveFilters = computed(
    () =>
      puzzlesSearch.value !== "" ||
      puzzlesFilterType.value !== "" ||
      puzzlesFilterDifficulty.value !== "",
  );

  function resetPuzzlesFilters() {
    puzzlesSearch.value = "";
    puzzlesFilterType.value = "";
    puzzlesFilterDifficulty.value = "";
  }

  const puzzleGeneratorOpen = ref(false);

  return {
    puzzleGeneratorOpen,
    puzzlesSearch,
    puzzlesFilterType,
    puzzlesFilterDifficulty,
    puzzlesHasActiveFilters,
    resetPuzzlesFilters,
  };
});
