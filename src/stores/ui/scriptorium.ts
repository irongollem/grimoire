// Scriptorium list filters and editor mode.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";
import type { DocumentScope } from "@/lib/scriptorium/documentScope";

export const useScriptoriumUiStore = defineStore("ui:scriptorium", () => {
  // Scriptorium UI state
  const scriptoriumPreviewMode = ref<"split" | "edit" | "preview">("split");
  const scriptoriumSearch = ref("");
  const scriptoriumFilterType = ref<ScriptoriumDocType | "all">("all");
  /**
   * Narrows the list to one `documentScopeOf` classification. "" is "Usable
   * here": the active campaign's documents plus account-wide ones — same
   * default as the Vault's `vaultFilterScope` (#915).
   */
  const scriptoriumFilterScope = ref<DocumentScope | "">("");
  const activeScriptoriumDocId = ref<string | null>(null);

  const scriptoriumHasActiveFilters = computed(
    () =>
      scriptoriumSearch.value !== "" ||
      scriptoriumFilterType.value !== "all" ||
      scriptoriumFilterScope.value !== "",
  );

  function resetScriptoriumFilters() {
    scriptoriumSearch.value = "";
    scriptoriumFilterType.value = "all";
    scriptoriumFilterScope.value = "";
  }

  return {
    scriptoriumPreviewMode,
    scriptoriumSearch,
    scriptoriumFilterType,
    scriptoriumFilterScope,
    scriptoriumHasActiveFilters,
    resetScriptoriumFilters,
    activeScriptoriumDocId,
  };
});
