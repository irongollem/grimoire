// Quest board filters, layout and story-flow selection.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

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

  // The story-flow canvas is unmounted whenever the DM switches to the quest
  // overview, so its selection has to live somewhere that outlives the
  // component. Session-scoped like the filters above: coming back to a quest
  // weeks later with a beat mysteriously pre-selected would be worse than a
  // clean canvas. The viewport itself persists separately, per quest, in
  // `lib/quests/viewport` — it is a place, not a selection.
  const questFlowSelection = ref<{ questId: string; beatId: string | null; edgeId: string | null } | null>(null);

  function questFlowSelectionFor(questId: string) {
    return questFlowSelection.value?.questId === questId ? questFlowSelection.value : null;
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
    questFlowSelection,
    questFlowSelectionFor,
    questsLootFilter,
    questsHasActiveFilters,
    resetQuestsFilters,
  };
});
