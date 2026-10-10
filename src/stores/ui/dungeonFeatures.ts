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

  return {
    lootTablesSearch,
    lootTablesTierFilter,
    lootTablesHasActiveFilters,
    resetLootTablesFilters,
    dungeonFeaturesSearch,
    dungeonFeaturesFilterType,
    dungeonFeaturesHasActiveFilters,
    resetDungeonFeaturesFilters,
  };
});
