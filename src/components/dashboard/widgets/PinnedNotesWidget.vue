<template>
  <DashboardWidget
    v-if="pinnedNotes.length"
    title="Pinned Notes"
    to="/notes"
    action-label="All notes →"
    max-height="none"
  >
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
      <RouterLink
        v-for="note in pinnedNotes.slice(0, 4)"
        :key="note.id"
        :to="`/notes/${note.id}`"
        class="bg-card flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/30 transition-colors group"
      >
        <div class="flex items-start gap-1.5">
          <IconPin class="h-3 w-3 text-primary mt-0.5 shrink-0" />
          <p class="font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {{ note.title || "Untitled" }}
          </p>
        </div>
        <p v-if="note.category" class="text-caption text-muted-foreground italic capitalize">
          {{ note.category.replace(/_/g, " ") }}
        </p>
        <p v-if="preview(note)" class="text-caption text-muted-foreground line-clamp-2">{{ preview(note) }}</p>
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconPin } from "@/lib/icons";
import { useNotes } from "@/composables/notes/useNotes";
import { extractTiptapText } from "@/lib/utils";
import DashboardWidget from "../DashboardWidget.vue";
import type { Note } from "@/types/notes.types";

/** Only the first four: the dashboard shows what is pinned, the notes list is
 *  where you read them. */
const { data: notes } = useNotes();
const pinnedNotes = computed(() => (notes.value ?? []).filter((n) => n.is_pinned));

function preview(note: Note): string {
  return extractTiptapText(note.content, 120);
}
</script>
