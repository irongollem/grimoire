// Spellbook (DM) list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSpellsUiStore = defineStore("ui:spells", () => {
  // Spellbook UI state
  const spellsSearch = ref("");
  const spellsFilterLevel = ref("");
  const spellsFilterSchool = ref("");
  const spellsFilterClass = ref("");
  const spellsFilterSource = ref("all");

  const spellsHasActiveFilters = computed(() =>
    spellsSearch.value !== "" ||
    spellsFilterLevel.value !== "" ||
    spellsFilterSchool.value !== "" ||
    spellsFilterClass.value !== "" ||
    spellsFilterSource.value !== "all",
  );

  function resetSpellsFilters() {
    spellsSearch.value = "";
    spellsFilterLevel.value = "";
    spellsFilterSchool.value = "";
    spellsFilterClass.value = "";
    spellsFilterSource.value = "all";
  }

  const spellGeneratorOpen = ref(false);

  return {
    spellsSearch,
    spellsFilterLevel,
    spellsFilterSchool,
    spellsFilterClass,
    spellsFilterSource,
    spellsHasActiveFilters,
    resetSpellsFilters,
    spellGeneratorOpen,
  };
});
