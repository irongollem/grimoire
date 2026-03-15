<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-xl font-bold text-foreground">Campaign Notes</h2>

    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <div v-else-if="!notes?.length" class="text-center py-12">
      <BookOpen class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p class="font-fell text-muted-foreground italic">No notes shared by your DM yet.</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="note in notes"
        :key="note.id"
        class="rounded-lg border border-border bg-card overflow-hidden"
        @click="toggle(note.id)"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
          <Pin v-if="note.is_pinned" class="h-3.5 w-3.5 text-primary shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ note.title }}</p>
            <p class="font-fell text-xs text-muted-foreground italic">{{ CATEGORY_LABELS[note.category] }}</p>
          </div>
          <div class="hidden sm:flex flex-wrap gap-1 shrink-0">
            <span
              v-for="tag in note.tags?.slice(0, 3)"
              :key="tag"
              class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wider"
            >{{ tag }}</span>
          </div>
          <ChevronDown
            class="h-4 w-4 text-muted-foreground shrink-0 transition-transform"
            :class="selected === note.id ? 'rotate-180' : ''"
          />
        </div>

        <!-- Expanded content -->
        <div v-if="selected === note.id" class="border-t border-border px-4 py-4 note-body">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-html="renderNote(note.content)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { BookOpen, Pin, ChevronDown } from "lucide-vue-next";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useNotes } from "@/composables/useNotes";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { NoteCategory } from "@/types/notes.types";

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  general:  "General",
  session:  "Session",
  lore:     "Lore",
  location: "Location",
  quest:    "Quest",
  faction:  "Faction",
};

const { data: notesRaw, isLoading } = useNotes();
const notes = computed(() =>
  (notesRaw.value ?? []).slice().sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return 0;
  }),
);

const selected = ref<string | null>(null);
function toggle(id: string) {
  selected.value = selected.value === id ? null : id;
}

function renderNote(content: string | null): string {
  if (!content) return "";
  try {
    const json = JSON.parse(content);
    return generateHTML(json, [StarterKit]);
  } catch {
    return "";
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.note-body :deep(p)          { @apply font-fell text-sm text-foreground mb-2 leading-relaxed; }
.note-body :deep(h1)         { @apply font-cinzel text-xl font-bold text-foreground mb-2 mt-4 first:mt-0; }
.note-body :deep(h2)         { @apply font-cinzel text-lg font-bold text-foreground mb-2 mt-3 first:mt-0; }
.note-body :deep(h3)         { @apply font-cinzel text-base font-bold text-foreground mb-1 mt-3 first:mt-0; }
.note-body :deep(ul)         { @apply list-disc pl-5 mb-2 space-y-1 font-fell text-sm; }
.note-body :deep(ol)         { @apply list-decimal pl-5 mb-2 space-y-1 font-fell text-sm; }
.note-body :deep(blockquote) { @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-2 font-fell text-sm; }
.note-body :deep(hr)         { @apply border-t border-primary/30 my-3; }
</style>
