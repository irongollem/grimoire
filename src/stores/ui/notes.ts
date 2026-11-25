// Notes list filters and sorts, and the player journal filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { JournalCategory } from "@/composables/notes/usePlayerJournal";
import type { SortField, SortDir } from "@/lib/noteSort";

export const useNotesUiStore = defineStore("ui:notes", () => {
  // Notes UI state
  const notesSearchQuery = ref("");
  const activeNoteId = ref<string | null>(null);
  const notesHasActiveFilters = computed(
    () => notesSearchQuery.value !== "",
  );
  // Sort state — DM notes list and player journal (shared default: newest created first)
  const notesSortBy = ref<SortField>("created");
  const notesSortDir = ref<SortDir>("desc");
  const journalSortBy = ref<SortField>("created");
  const journalSortDir = ref<SortDir>("desc");
  // Player journal category filter (Filter State Pattern — survives navigation)
  const journalFilterCategory = ref<JournalCategory | null>(null);
  // The World tab's filter box (#1279 item 28): it filters the list on screen, so it lives here, not in a local ref.
  const journalWorldSearch = ref("");
  const journalHasActiveFilters = computed(() => journalFilterCategory.value !== null);
  const journalWorldHasActiveFilters = computed(() => journalWorldSearch.value.trim() !== "");
  function resetJournalFilters() { journalFilterCategory.value = null; }
  function resetJournalWorldFilters() { journalWorldSearch.value = ""; }

  function resetNotesFilters() {
    notesSearchQuery.value = "";
  }

  return {
    notesSearchQuery,
    notesHasActiveFilters,
    activeNoteId,
    notesSortBy,
    notesSortDir,
    journalSortBy,
    journalSortDir,
    journalFilterCategory,
    journalHasActiveFilters,
    resetJournalFilters,
    journalWorldSearch,
    journalWorldHasActiveFilters,
    resetJournalWorldFilters,
    resetNotesFilters,
  };
});
