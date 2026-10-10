// Character Codex: class features, feats, archetypes, custom classes, backgrounds, active tab.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useCodexUiStore = defineStore("ui:codex", () => {
  // Class Features (Abilities) UI state
  const featuresSearch = ref("");
  /** "all", "passive" (no activation) or a `mechanics.activation` value. */
  const featuresFilterActivation = ref("all");

  const featuresHasActiveFilters = computed(
    () => featuresSearch.value !== "" || featuresFilterActivation.value !== "all",
  );

  function resetFeaturesFilters() {
    featuresSearch.value = "";
    featuresFilterActivation.value = "all";
  }

  // Feats (Codex) UI state
  const featsSearch = ref("");
  /** "all" or a `FeatCategory`. */
  const featsFilterCategory = ref("all");
  /** "all", "2014" or "2024". */
  const featsFilterEdition = ref("all");

  const featsHasActiveFilters = computed(
    () => featsSearch.value !== "" || featsFilterCategory.value !== "all" || featsFilterEdition.value !== "all",
  );

  function resetFeatsFilters() {
    featsSearch.value = "";
    featsFilterCategory.value = "all";
    featsFilterEdition.value = "all";
  }

  // Archetypes (Custom Subclasses) UI state
  const archetypesSearch = ref("");
  const archetypesFilterClass = ref("all");

  const archetypesHasActiveFilters = computed(
    () => archetypesSearch.value !== "" || archetypesFilterClass.value !== "all",
  );

  function resetArchetypesFilters() {
    archetypesSearch.value = "";
    archetypesFilterClass.value = "all";
  }

  // Custom Classes UI state
  const customClassesSearch = ref("");

  const customClassesHasActiveFilters = computed(() => customClassesSearch.value !== "");

  function resetCustomClassesFilters() {
    customClassesSearch.value = "";
  }

  // Backgrounds UI state
  const backgroundsSearch = ref("");
  const backgroundsFilterSource = ref<"all" | "custom" | "library">("all");

  const backgroundsHasActiveFilters = computed(
    () => backgroundsSearch.value !== "" || backgroundsFilterSource.value !== "all",
  );

  function resetBackgroundsFilters() {
    backgroundsSearch.value = "";
    backgroundsFilterSource.value = "all";
  }

  // Character Codex — active tab in the consolidated player-options page.
  const codexActiveTab = ref<"species" | "backgrounds" | "classes" | "archetypes" | "abilities" | "feats">("species");

  return {
    featuresSearch,
    featuresFilterActivation,
    featuresHasActiveFilters,
    resetFeaturesFilters,
    featsSearch,
    featsFilterCategory,
    featsFilterEdition,
    featsHasActiveFilters,
    resetFeatsFilters,
    archetypesSearch,
    archetypesFilterClass,
    archetypesHasActiveFilters,
    resetArchetypesFilters,
    customClassesSearch,
    customClassesHasActiveFilters,
    resetCustomClassesFilters,
    backgroundsSearch,
    backgroundsFilterSource,
    backgroundsHasActiveFilters,
    resetBackgroundsFilters,
    codexActiveTab,
  };
});
