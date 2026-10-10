// Hall of the Fallen and Hall of Heroes filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useHallUiStore = defineStore("ui:hall", () => {
  // Hall of the Fallen (#982): filters over the wall already on screen, so they live here
  // like every other list filter. `hallCampaign` is tri-state on purpose: null is "never
  // touched", which the wall reads as All for a player and as the active campaign for a
  // DM; "all" is an explicit All. Clear returns to the untouched state.
  const hallCampaign = ref<string | null>(null);
  const hallKind = ref<"all" | "fallen" | "retired">("all");
  const hasHallFiltersActive = computed(() => hallCampaign.value !== null || hallKind.value !== "all");

  function resetHallFilters() {
    hallCampaign.value = null;
    hallKind.value = "all";
  }

  // Hall of Heroes UI state
  const hallOfHeroesSearch = ref("");
  const hallOfHeroesFilterSetting = ref("all");

  const hallOfHeroesHasActiveFilters = computed(
    () => hallOfHeroesSearch.value.trim() !== "" || hallOfHeroesFilterSetting.value !== "all",
  );

  function resetHallOfHeroesFilters() {
    hallOfHeroesSearch.value = "";
    hallOfHeroesFilterSetting.value = "all";
  }

  return {
    hallCampaign,
    hallKind,
    hasHallFiltersActive,
    resetHallFilters,
    hallOfHeroesSearch,
    hallOfHeroesFilterSetting,
    hallOfHeroesHasActiveFilters,
    resetHallOfHeroesFilters,
  };
});
