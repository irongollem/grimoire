// Quest board filters and layout, and the quest drawer's width.
import { defineStore } from "pinia";
import { ref, computed, type Ref } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { DRAWER_DEFAULT_REM } from "@/lib/quests/drawer";

export const useQuestsUiStore = defineStore("ui:quests", () => {
  // Quest UI state
  const questGeneratorOpen = ref(false);
  // Kanban vs. list is a layout preference and persists, like `entityListLayout`.
  // The filters below are session-scoped (plain refs): they survive navigation
  // but must not persist, or a DM returns weeks later to a near-empty board with
  // no memory of the search term or facet that emptied it.
  const questsIsKanban = useStorage("grimoire:quests:kanban", true, safeLocalStorage());
  const questsSearch = ref("");
  const questsPartyFilter = ref(false);
  const questsEntityFilter = ref("");
  // Summary-backed facets remain inert until their batched board data has loaded,
  // so a slow response never makes quests disappear temporarily.
  const questsPrepGapsFilter = ref(false);
  const questsLootFilter = ref(false);

  const questsHasActiveFilters = computed(() =>
    questsSearch.value !== "" ||
    questsPartyFilter.value ||
    questsEntityFilter.value !== "" ||
    questsPrepGapsFilter.value ||
    questsLootFilter.value,
  );

  // The drawer's width is a layout preference, kept per quest: a long beat
  // wants it wide, a quick one narrow. Refs are cached so a quest's width is one
  // reactive value however many components ask for it.
  const drawerWidths = new Map<string, Ref<number>>();
  function drawerWidthFor(questId: string) {
    let width = drawerWidths.get(questId);
    if (!width) {
      width = useStorage(`grimoire:quest-drawer:${questId}`, DRAWER_DEFAULT_REM, safeLocalStorage());
      drawerWidths.set(questId, width);
    }
    return width;
  }

  // The session the toolbar files marks under, kept per campaign. Only the DM's
  // choice is stored ("" = no choice, so the default applies); the default is
  // derived from the log each time and so never goes stale.
  const markSessionChoices = new Map<string, Ref<string>>();
  function markSessionChoiceFor(campaignId: string) {
    let choice = markSessionChoices.get(campaignId);
    if (!choice) {
      choice = useStorage(`grimoire:quest-mark-session:${campaignId}`, "", safeLocalStorage());
      markSessionChoices.set(campaignId, choice);
    }
    return choice;
  }

  function resetQuestsFilters() {
    questsSearch.value = "";
    questsPartyFilter.value = false;
    questsEntityFilter.value = "";
    questsPrepGapsFilter.value = false;
    questsLootFilter.value = false;
  }

  return {
    questGeneratorOpen,
    questsSearch,
    questsIsKanban,
    questsPartyFilter,
    questsEntityFilter,
    questsPrepGapsFilter,
    drawerWidthFor,
    markSessionChoiceFor,
    questsLootFilter,
    questsHasActiveFilters,
    resetQuestsFilters,
  };
});
