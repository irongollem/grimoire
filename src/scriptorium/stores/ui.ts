// Scriptorium list filters and editor focus.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import type { ScriptoriumDocType, ScriptoriumKind } from "@/scriptorium/types";
import type { DocumentScope } from "@/scriptorium/lib/documentScope";
import { parseZoomChoice, serializeZoomChoice, type ZoomChoice } from "@/scriptorium/lib/zoom";

export const useScriptoriumUiStore = defineStore("ui:scriptorium", () => {
  // Scriptorium UI state
  /**
   * Focus: the chapter list (and later the side panel) steps aside so the page
   * you write on has the room. Remembered across books; Read as spreads is a
   * visit and is never remembered.
   */
  const scriptoriumFocus = useStorage<boolean>("grimoire:scriptorium:focus", false, safeLocalStorage(), {
    serializer: { read: (raw) => raw === "true", write: (on) => String(on) },
  });
  /** The page zoom: Fit width (default) or a fixed percentage. Remembered per browser, like Focus. */
  const scriptoriumZoom = useStorage<ZoomChoice>("grimoire:scriptorium:zoom", "fit", safeLocalStorage(), {
    serializer: { read: parseZoomChoice, write: serializeZoomChoice },
  });
  /** The scale the page is drawn at now, written by the chapter editor, so a step from Fit starts from the fitted size. */
  const scriptoriumDrawnScale = ref(1);
  /** The left rail's tab: the chapter list, or the book kit of blocks, entries and art. */
  const scriptoriumRailTab = ref<"chapters" | "kit">("chapters");
  /** Counts the toolbar's "From the campaign" presses; the book kit puts the cursor in its search when it changes. */
  const scriptoriumCampaignSearchAsked = ref(0);
  function askForCampaignSearch() {
    scriptoriumRailTab.value = "kit";
    scriptoriumCampaignSearchAsked.value++;
  }
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
    scriptoriumFocus,
    scriptoriumZoom,
    scriptoriumDrawnScale,
    scriptoriumRailTab,
    scriptoriumCampaignSearchAsked,
    askForCampaignSearch,
    scriptoriumSearch,
    scriptoriumFilterType,
    scriptoriumFilterKind,
    scriptoriumFilterScope,
    scriptoriumHasActiveFilters,
    resetScriptoriumFilters,
    activeScriptoriumDocId,
  };
});
