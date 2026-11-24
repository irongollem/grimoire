// The Canon page's list state (#1226, #1255, #1258): the filter on what the table added, the arc the
// page is narrowed to, the page's one search, the truths' mark filter and grouping, and which part the page is on.
// Session-scoped, so they survive navigation but are not kept for weeks; the part the DM was last on is the one
// per-viewer convenience kept across sessions.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useStorage } from "@vueuse/core";
import type { FactFilter } from "@/lib/canon/canonTableFacts";
import { DEFAULT_TRUTH_FILTER, type TruthFilter } from "@/lib/canon/canonTruthView";
import { CANON_SECTIONS, isSectionId, type CanonSectionId } from "@/lib/canon/canonParts";
import { DEFAULT_TONIGHT_SCOPE, type TonightScope } from "@/lib/canon/canonTonight";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

export const DEFAULT_FACT_FILTER: FactFilter = "new";
export const DEFAULT_CANON_PART: CanonSectionId = CANON_SECTIONS[0].id;

export const useCanonUiStore = defineStore("ui:canon", () => {
  const tableFactFilter = ref<FactFilter>(DEFAULT_FACT_FILTER);

  const tableFactsHasActiveFilters = computed(() => tableFactFilter.value !== DEFAULT_FACT_FILTER);
  function resetTableFactFilters() {
    tableFactFilter.value = DEFAULT_FACT_FILTER;
  }

  /** The part `/canon` opens on: the last one the DM was on. */
  const storedPart = useStorage<string>("grimoire:canon-part", DEFAULT_CANON_PART, safeLocalStorage());
  const lastPart = computed<CanonSectionId>({
    get: () => (isSectionId(storedPart.value) ? storedPart.value : DEFAULT_CANON_PART),
    set: (id) => {
      storedPart.value = id;
    },
  });

  /** The arc every part is narrowed to; null shows everything. */
  const arcFilter = ref<string | null>(null);
  /** The page's one search; while it is set the results stand in place of the part. */
  const query = ref("");

  /** The truths ledger's mark filter and whether it groups by what each truth is about (#1258 item 22). */
  const truthFilter = ref<TruthFilter>(DEFAULT_TRUTH_FILTER);
  const truthsGrouped = ref(false);

  /** Which list the Secrets and questions chapter shows. A view, not a filter: it is not part of `hasActiveFilters`. */
  const secretsView = ref<"secrets" | "questions">("secrets");

  /** What Tonight is narrowed to (#1258 item 1); the default is where the party is. */
  const tonightScope = ref<TonightScope>(DEFAULT_TONIGHT_SCOPE);

  const hasActiveFilters = computed(
    () => arcFilter.value !== null || tonightScope.value !== DEFAULT_TONIGHT_SCOPE || query.value.trim() !== "",
  );
  function resetFilters() {
    arcFilter.value = null;
    tonightScope.value = DEFAULT_TONIGHT_SCOPE;
    query.value = "";
  }

  const truthsHaveActiveFilters = computed(() => truthFilter.value !== DEFAULT_TRUTH_FILTER || truthsGrouped.value);
  function resetTruthFilters() {
    truthFilter.value = DEFAULT_TRUTH_FILTER;
    truthsGrouped.value = false;
  }

  return {
    tableFactFilter, tableFactsHasActiveFilters, resetTableFactFilters,
    lastPart, arcFilter, query, tonightScope, hasActiveFilters, resetFilters,
    truthFilter, truthsGrouped, truthsHaveActiveFilters, resetTruthFilters, secretsView,
  };
});
