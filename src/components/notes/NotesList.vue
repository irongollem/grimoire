<template>
  <div>
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search notes…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <SortControl v-model:sort-by="sortBy" v-model:sort-dir="sortDir" :options="SORT_OPTIONS" />
      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="cat in CATEGORY_OPTIONS"
          :key="cat.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="categoryFilter === cat.value
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="categoryFilter = cat.value"
        >
          {{ cat.label }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && categoryFilter === 'all'"
      title="No notes yet"
      description="Begin recording your campaign's history, lore, and secrets."
    >
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="handleNew"
        >
          Write your first note
        </button>
      </template>
    </EmptyState>

    <p v-else-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
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
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <NoteCard v-for="note in unpinned" :key="note.id" :note="note" :locked="lockedNoteIds.has(note.id)" />
      </div>
    </template>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
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
import { IconSearch } from '@/lib/icons';
import { useNotes, useReorderNotes } from "@/composables/useNotes";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import SortControl from "@/components/common/SortControl.vue";
import NoteCard from "@/components/notes/NoteCard.vue";
import { sortEntities, type SortField } from "@/lib/noteSort";
import type { Note } from "@/types/notes.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

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
];

const SORT_OPTIONS = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title A–Z" },
  { value: "manual", label: "Manual" },
] as const satisfies readonly { value: SortField; label: string }[];

const search = ref("");
const categoryFilter = ref("all");
const { data: notes, isLoading } = useNotes();
const { mutate: reorder } = useReorderNotes();

const { notesSortBy: sortBy, notesSortDir: sortDir } = storeToRefs(useUiStore());

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
  if (categoryFilter.value !== "all") list = list.filter((n) => n.category === categoryFilter.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
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
