// The Canon page's list state (#1226): the Chronicle's order and the filter on what the table added. Session-scoped, so
// they survive navigation but are not kept for weeks.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ChronicleOrder } from "@/lib/canon/canonChronicle";
import type { FactFilter } from "@/lib/canon/canonTableFacts";

export const DEFAULT_FACT_FILTER: FactFilter = "new";

export const useCanonUiStore = defineStore("ui:canon", () => {
  const chronicleOrder = ref<ChronicleOrder>("newest");
  const tableFactFilter = ref<FactFilter>(DEFAULT_FACT_FILTER);

  const tableFactsHasActiveFilters = computed(() => tableFactFilter.value !== DEFAULT_FACT_FILTER);
  function resetTableFactFilters() {
    tableFactFilter.value = DEFAULT_FACT_FILTER;
  }

  return { chronicleOrder, tableFactFilter, tableFactsHasActiveFilters, resetTableFactFilters };
});
