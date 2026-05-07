<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-xl font-bold text-foreground">Campaign Notes</h2>

    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <div v-else-if="!notes?.length" class="text-center py-12">
      <IconPopulate class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
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
          <IconPin v-if="note.is_pinned" class="h-3.5 w-3.5 text-primary shrink-0" />
          <span v-if="isNew(note.id, note.updated_at)" class="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" title="New" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ note.title }}</p>
            <p class="font-fell text-xs text-muted-foreground italic">
              {{ CATEGORY_LABELS[note.category] }}
              <span v-if="note.category === 'session' && note.session_num != null"> · Session {{ note.session_num }}</span>
            </p>
          </div>
          <div class="hidden sm:flex flex-wrap gap-1 shrink-0">
            <span
              v-for="tag in note.tags?.slice(0, 3)"
              :key="tag"
              class="font-cinzel text-2xs md:text-sm px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wider"
            >{{ tag }}</span>
          </div>
          <IconChevronDown
            class="h-4 w-4 text-muted-foreground shrink-0 transition-transform"
            :class="selected === note.id ? 'rotate-180' : ''"
          />
        </div>

        <!-- Expanded content -->
        <div v-if="selected === note.id" class="border-t border-border px-4 py-4">
          <RichTextViewer :content="note.content" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconChevronDown, IconPin, IconPopulate } from '@/lib/icons';
import { useNotes } from "@/composables/useNotes";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
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
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    // Session notes sort by session_num ascending (nulls last)
    if (a.category === "session" && b.category === "session") {
      if (a.session_num !== null && b.session_num !== null) return a.session_num - b.session_num;
      if (a.session_num !== null) return -1;
      if (b.session_num !== null) return 1;
    }
    // Session notes before other categories
    if (a.category === "session" && b.category !== "session") return -1;
    if (a.category !== "session" && b.category === "session") return 1;
    return a.title.localeCompare(b.title);
  }),
);

const { isNew } = useReadItems("note");
const { mutate: markRead } = useMarkRead();

const selected = ref<string | null>(null);
function toggle(id: string) {
  if (selected.value !== id) markRead({ entityType: "note", entityId: id });
  selected.value = selected.value === id ? null : id;
}
</script>
