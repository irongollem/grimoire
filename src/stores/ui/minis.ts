// Simulacrum (minis gallery) filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { MiniFormat, MiniStatus } from "@/types/mini.types";

export const useMinisUiStore = defineStore("ui:minis", () => {
  // Simulacrum (Minis gallery) UI state
  const minisSearch = ref("");
  const minisFilterFormat = ref<MiniFormat | "all">("all");
  const minisFilterStatus = ref<MiniStatus | "all" | "in-progress">("all");

  const minisHasActiveFilters = computed(
    () =>
      minisSearch.value !== "" ||
      minisFilterFormat.value !== "all" ||
      minisFilterStatus.value !== "all",
  );

  function resetMinisFilters() {
    minisSearch.value = "";
    minisFilterFormat.value = "all";
    minisFilterStatus.value = "all";
  }

  return {
    minisSearch,
    minisFilterFormat,
    minisFilterStatus,
    minisHasActiveFilters,
    resetMinisFilters,
  };
});
