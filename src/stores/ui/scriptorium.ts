// Scriptorium list filters and editor mode.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import type { ScriptoriumDocType, ScriptoriumKind } from "@/types/scriptorium.types";
import type { DocumentScope } from "@/lib/scriptorium/documentScope";

export const useScriptoriumUiStore = defineStore("ui:scriptorium", () => {
  // Scriptorium UI state
  /**
   * The editor's remembered way of looking at a book: Write (no preview) or
   * Split. Inspect is a full-screen visit that Esc returns from, so it is never
   * the mode a book opens in.
   */
  const scriptoriumEditorMode = useStorage<"write" | "split">("grimoire:scriptorium:editor-mode", "split", safeLocalStorage(), {
    serializer: { read: (raw) => (raw === "write" ? "write" : "split"), write: (mode) => mode },
  });
  const scriptoriumSearch = ref("");
  const scriptoriumFilterType = ref<ScriptoriumDocType | "all">("all");
  /** All / Handouts / Books: the first thing the list asks, since the two are different things (#1115). */
  const scriptoriumFilterKind = ref<ScriptoriumKind | "all">("all");
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
      scriptoriumFilterKind.value !== "all" ||
      scriptoriumFilterScope.value !== "",
  );

  function resetScriptoriumFilters() {
    scriptoriumSearch.value = "";
    scriptoriumFilterType.value = "all";
    scriptoriumFilterKind.value = "all";
    scriptoriumFilterScope.value = "";
  }

  return {
    scriptoriumEditorMode,
    scriptoriumSearch,
    scriptoriumFilterType,
    scriptoriumFilterKind,
    scriptoriumFilterScope,
    scriptoriumHasActiveFilters,
    resetScriptoriumFilters,
    activeScriptoriumDocId,
  };
});
