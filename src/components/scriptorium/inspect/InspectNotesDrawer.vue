<template>
  <aside aria-label="Notes" class="flex min-h-0 w-full flex-col border-l border-border bg-card text-foreground">
    <h2 class="px-4.5 pt-4 pb-1.5 text-label font-bold text-primary">Notes on the book</h2>
    <p class="px-4.5 pb-3 text-label-lg leading-snug text-muted-foreground">
      Click anywhere on a page to pin a note. Only you see them; they never print.
    </p>

    <ol class="min-h-0 flex-1 overflow-y-auto" aria-label="Notes">
      <li v-for="row in rows" :key="row.note.id" class="border-t border-border">
        <AppButton
          variant="menu"
          block
          class="h-auto flex-col items-start gap-1 rounded-none px-4.5 py-3 max-md:min-h-11"
          :class="row.note.done && 'opacity-60'"
          @click="go(row.note)"
        >
          <span class="text-label-lg tabular-nums text-muted-foreground">{{ row.where }}</span>
          <span data-hand class="whitespace-pre-wrap text-left text-body leading-snug">{{ row.note.body }}</span>
        </AppButton>
      </li>
      <li v-if="rows.length === 0 && !notesQuery.isPending.value" class="border-t border-border px-4.5 py-3 text-label-lg italic text-muted-foreground">
        No notes yet.
      </li>
    </ol>

    <p v-if="notesQuery.error.value" class="px-4.5 py-2 text-caption text-destructive" role="alert">
      Could not load the notes.
    </p>

    <div v-if="doneCount > 0" class="flex items-center gap-1.5 border-t border-border px-4.5 py-3 text-label-lg text-muted-foreground">
      <span>{{ showDone ? `${doneCount} done ${doneCount === 1 ? "note" : "notes"} shown` : `${doneCount} done ${doneCount === 1 ? "note" : "notes"} hidden` }} ·</span>
      <AppButton variant="link" size="sm" :label="showDone ? 'Hide' : 'Show'" @click="showDone = !showDone" />
    </div>
  </aside>
</template>

<script setup lang="ts">
/**
 * "Notes on the book" (Scriptorium Chapters, frame 04): the open notes in book
 * order, each with where it sits. The pins on the pages are the same notes, in
 * the same order and numbering, through the state this and the layer share.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useBookNotes } from "@/composables/scriptorium/useScriptoriumNotes";
import type { BookLayoutResult } from "@/lib/scriptorium/bookLayout/types";
import { noteWhere, numberNotes } from "@/lib/scriptorium/inspect/notePlacement";
import { inspectNotesState } from "@/lib/scriptorium/inspect/notesState";
import type { ScriptoriumChapterSummary, ScriptoriumNote } from "@/types/scriptorium.types";

const { documentId, chapters, result } = defineProps<{
  documentId: string;
  chapters: ScriptoriumChapterSummary[];
  /** The newest layout, for printed page labels; null before the first one. */
  result: BookLayoutResult | null;
}>();

const emit = defineEmits<{ goToNote: [target: { chapterId: string; blockId: string | null }] }>();

const state = inspectNotesState(documentId);
const notesQuery = useBookNotes(() => documentId);
const notes = computed(() => notesQuery.data.value ?? []);

const showDone = computed({
  get: () => state.showDone.value,
  set: (value: boolean) => {
    state.showDone.value = value;
  },
});
const doneCount = computed(() => notes.value.filter((note) => note.done).length);

const rows = computed(() =>
  numberNotes(notes.value, chapters, state.placements.value, showDone.value).map(({ note, n }) => {
    const pageIndex = state.placements.value.get(note.id)?.pageIndex ?? null;
    const label = pageIndex === null ? null : (result?.pages[pageIndex]?.label ?? null);
    const title = chapters.find((chapter) => chapter.id === note.chapter_id)?.title.trim() || "Untitled chapter";
    return { note, where: noteWhere(n, label, title) };
  }),
);

function go(note: ScriptoriumNote) {
  state.focusNoteId.value = note.id;
  emit("goToNote", { chapterId: note.chapter_id, blockId: note.block_id });
}
</script>
