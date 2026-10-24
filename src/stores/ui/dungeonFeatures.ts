// Loot Tables tab filters and Dungeon Craft filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useDungeonFeaturesUiStore = defineStore("ui:dungeonFeatures", () => {
  // Loot Tables tab filters
  const lootTablesSearch = ref("");
  const lootTablesTierFilter = ref("");

  const lootTablesHasActiveFilters = computed(
    () => lootTablesSearch.value !== "" || lootTablesTierFilter.value !== "",
  );

  function resetLootTablesFilters() {
    lootTablesSearch.value = "";
    lootTablesTierFilter.value = "";
  }

  // Notice Boards tab filters
  const noticeBoardsSearch = ref("");
  const noticeBoardsHasActiveFilters = computed(() => noticeBoardsSearch.value !== "");

  function resetNoticeBoardsFilters() {
    noticeBoardsSearch.value = "";
  }

  // Dungeon Craft (Dungeon Features) UI state
  const dungeonFeaturesSearch = ref("");
  const dungeonFeaturesFilterType = ref("");

  const dungeonFeaturesHasActiveFilters = computed(
    () => dungeonFeaturesSearch.value !== "" || dungeonFeaturesFilterType.value !== "",
  );

  function resetDungeonFeaturesFilters() {
    dungeonFeaturesSearch.value = "";
    dungeonFeaturesFilterType.value = "";
  }

  // Bumped by the phone bottom-nav "+" on the Roll Tables tab. A new roll table
  // opens inline in the tab rather than on a route, so the FAB cannot navigate.
  const rollTableCreateSignal = ref(0);

  return {
    rollTableCreateSignal,
    lootTablesSearch,
    lootTablesTierFilter,
    lootTablesHasActiveFilters,
    resetLootTablesFilters,
    noticeBoardsSearch,
    noticeBoardsHasActiveFilters,
    resetNoticeBoardsFilters,
    dungeonFeaturesSearch,
    dungeonFeaturesFilterType,
    dungeonFeaturesHasActiveFilters,
    resetDungeonFeaturesFilters,
  };
});
