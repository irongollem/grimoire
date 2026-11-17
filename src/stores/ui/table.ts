// The AI table's list filters: today the search over the story so far.
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useTableUiStore = defineStore("ui:table", () => {
  const storyRecordSearch = ref("");
  const storyRecordHasActiveFilters = computed(() => storyRecordSearch.value.trim() !== "");
  function resetStoryRecordFilters(): void {
    storyRecordSearch.value = "";
  }
  return { storyRecordSearch, storyRecordHasActiveFilters, resetStoryRecordFilters };
});
