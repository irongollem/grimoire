// The Canon page's list state (#1226, #1255): the Chronicle's order, the filter on what the table added, the arc the
// page is narrowed to and each part's search. Session-scoped, so they survive navigation but are not kept for weeks.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ChronicleOrder } from "@/lib/canon/canonChronicle";
import type { FactFilter } from "@/lib/canon/canonTableFacts";

export const DEFAULT_FACT_FILTER: FactFilter = "new";

/** The parts that have a search of their own: each filters its own list on the page. */
export const SEARCH_PARTS = ["truths", "forces", "secrets", "questions", "lore", "backstories"] as const;
export type SearchPart = (typeof SEARCH_PARTS)[number];

const emptyQueries = (): Record<SearchPart, string> => ({ truths: "", forces: "", secrets: "", questions: "", lore: "", backstories: "" });

export const useCanonUiStore = defineStore("ui:canon", () => {
  const chronicleOrder = ref<ChronicleOrder>("newest");
  const tableFactFilter = ref<FactFilter>(DEFAULT_FACT_FILTER);

  const tableFactsHasActiveFilters = computed(() => tableFactFilter.value !== DEFAULT_FACT_FILTER);
  function resetTableFactFilters() {
    tableFactFilter.value = DEFAULT_FACT_FILTER;
  }

  /** The arc every part is narrowed to; null shows everything. */
  const arcFilter = ref<string | null>(null);
  const partQuery = ref<Record<SearchPart, string>>(emptyQueries());

  const hasActiveFilters = computed(() => arcFilter.value !== null || SEARCH_PARTS.some((p) => partQuery.value[p].trim() !== ""));
  function resetFilters() {
    arcFilter.value = null;
    partQuery.value = emptyQueries();
  }

  return { chronicleOrder, tableFactFilter, tableFactsHasActiveFilters, resetTableFactFilters, arcFilter, partQuery, hasActiveFilters, resetFilters };
});
