<template>
  <div>
    <!-- Filters -->
    <ListFilterBar
      class="mb-5"
      :has-active-filters="notesUi.notesHasActiveFilters"
      @clear="notesUi.resetNotesFilters()"
    >
      <ListSearchInput v-model="notesUi.notesSearchQuery" placeholder="Search notes…" />
      <SortControl v-model:sort-by="sortBy" v-model:sort-dir="sortDir" :options="SORT_OPTIONS" />
      <ListFilterGroup
        v-model="notesUi.notesFilterCategory"
        :options="CATEGORY_OPTIONS"
        aria-label="Note category filter"
      />
    </ListFilterBar>

    <ListSkeleton v-if="isLoading" variant="text" />

    <EmptyState
      v-else-if="!filtered.length && !notesUi.notesHasActiveFilters"
      title="No notes yet"
      description="Begin recording your campaign's history, lore, and secrets."
    >
      <template #icon><IconNavNotes class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Write your first note" @click="handleNew" />
      </template>
    </EmptyState>

    <p v-else-if="!filtered.length" class="text-center text-body text-muted-foreground italic py-12">
      No notes match your filters.
    </p>

    <template v-else>
      <!-- Pinned notes always float to the top, statically, in every sort mode -->
      <div v-if="pinned.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-3">
        <NoteCard v-for="note in pinned" :key="note.id" :note="note" :locked="lockedNoteIds.has(note.id)" />
      </div>

      <!-- Unpinned notes: draggable in manual mode, static otherwise -->
      <VueDraggable
        v-if="sortBy === 'manual'"
        v-model="dragList"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        handle=".note-drag-handle"
        :animation="150"
        ghost-class="opacity-40"
        @end="persistOrder"
      >
        <NoteCard
          v-for="note in dragList"
          :key="note.id"
          :note="note"
          :locked="lockedNoteIds.has(note.id)"
          show-handle
        />
      </VueDraggable>
      <!-- Windowed: only the cards near the viewport are mounted. Manual mode above
           stays an ordinary render, because dragging needs every card present. -->
      <VirtualGrid
        v-else
        :items="unpinned"
        :item-key="noteKey"
        :columns="columns"
        :estimate-row-height="NOTE_ROW_PX"
      >
        <template #default="{ item: note }">
          <NoteCard :note="note" :locked="lockedNoteIds.has(note.id)" />
        </template>
      </VirtualGrid>
    </template>

    <p v-if="filtered.length" class="mt-4 text-caption text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ notes?.length ?? 0 }} notes
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="notes" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { VueDraggable } from "vue-draggable-plus";
import { IconNavNotes } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import { useNotes, useReorderNotes } from "@/composables/notes/useNotes";
import { useNotesUiStore } from "@/stores/ui/notes";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import SortControl from "@/components/common/controls/SortControl.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/list/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import NoteCard from "@/components/notes/NoteCard.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { sortEntities, type SortField } from "@/lib/noteSort";
import type { Note, NoteCategory } from "@/types/notes.types";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";

const router = useRouter();
const { canCreate, quota: noteQuota } = useQuota("notes");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/notes/new");
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "session", label: "Session" },
  { value: "lore", label: "Lore" },
  { value: "location", label: "Location" },
  { value: "quest", label: "Quest" },
  { value: "faction", label: "Faction" },
] as const satisfies readonly { value: NoteCategory | "all"; label: string }[];

const SORT_OPTIONS = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title A–Z" },
  { value: "manual", label: "Manual" },
] as const satisfies readonly { value: SortField; label: string }[];

// Mirrors the `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` the pinned
// and manual-sort grids still carry.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const noteKey = (note: Note) => note.id;

// Row height before a row is measured (px): 166-170px across 20 notes, 170 the median, measured at a 390px
// phone on 8 Oct 2026 over the dev:campaigns fixture. It decides where a
// restored scroll lands, since coming back from a detail re-renders every
// unmeasured row above the viewport.
const NOTE_ROW_PX = 170;

const { data: notes, isLoading } = useNotes();
const { mutate: reorder } = useReorderNotes();

// Search + category live in the store so they survive navigating into a note
// and back (Filter State Pattern) — the same place the sort already lived.
const notesUi = useNotesUiStore();
const { notesSortBy: sortBy, notesSortDir: sortDir } = storeToRefs(notesUi);

const lockedNoteIds = computed((): Set<string> => {
  const q = noteQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(notes.value ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((n) => n.id));
});

const filtered = computed((): Note[] => {
  let list = notes.value ?? [];
  if (notesUi.notesFilterCategory !== "all") list = list.filter((n) => n.category === notesUi.notesFilterCategory);
  if (notesUi.notesSearchQuery.trim()) {
    const q = notesUi.notesSearchQuery.trim().toLowerCase();
    list = list.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  return sortEntities(list, sortBy.value, sortDir.value);
});

// Pinned notes float to the top in every sort mode; only the unpinned remainder
// is draggable in manual mode.
const pinned = computed(() => filtered.value.filter((n) => n.is_pinned));
const unpinned = computed(() => filtered.value.filter((n) => !n.is_pinned));

// Local mutable copy for drag-and-drop (VueDraggable reorders this in place);
// kept in sync with the derived list, persisted to the server on drag end.
const dragList = ref<Note[]>([]);
watch(unpinned, (list) => { dragList.value = [...list]; }, { immediate: true });

function persistOrder() {
  reorder(dragList.value.map((n) => n.id));
}
</script>
