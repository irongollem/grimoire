// Notes list filters and sorts, and the player journal filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NoteCategory } from "@/types/notes.types";
import type { JournalCategory } from "@/composables/notes/usePlayerJournal";
import type { SortField, SortDir } from "@/lib/noteSort";

export const useNotesUiStore = defineStore("ui:notes", () => {
  // Notes UI state
  const notesFilterCategory = ref<NoteCategory | "all">("all");
  const notesSearchQuery = ref("");
  const activeNoteId = ref<string | null>(null);
  const notesHasActiveFilters = computed(
    () => notesSearchQuery.value !== "" || notesFilterCategory.value !== "all",
  );
  // Sort state — DM notes list and player journal (shared default: newest created first)
  const notesSortBy = ref<SortField>("created");
  const notesSortDir = ref<SortDir>("desc");
  const journalSortBy = ref<SortField>("created");
  const journalSortDir = ref<SortDir>("desc");
  // Player journal category filter (Filter State Pattern — survives navigation)
  const journalFilterCategory = ref<JournalCategory | null>(null);
  const journalHasActiveFilters = computed(() => journalFilterCategory.value !== null);
  function resetJournalFilters() { journalFilterCategory.value = null; }

  function resetNotesFilters() {
    notesFilterCategory.value = "all";
    notesSearchQuery.value = "";
  }

  return {
    notesFilterCategory,
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
    resetNotesFilters,
  };
});
