<template>
  <DashboardWidget
    v-if="pinnedNotes && pinnedNotes.length"
    title="Pinned Notes"
    to="/notes"
    action-label="All notes →"
    max-height="none"
  >
    <!-- Columns follow the card, not the viewport: the DM picks this widget's
         width, so a cell-wide card on a desktop must stack rather than squeeze
         four notes into a quarter of the screen. -->
    <div class="@container">
      <div class="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-4 gap-px bg-border">
        <RouterLink
          v-for="note in pinnedNotes"
          :key="note.id"
          :to="`/notes/${note.id}`"
          class="bg-card flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/30 transition-colors group"
        >
          <div class="flex items-start gap-1.5">
            <IconPin class="h-3 w-3 text-primary mt-0.5 shrink-0" />
            <p class="text-heading-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {{ note.title || "Untitled" }}
            </p>
          </div>
          <p v-if="note.category" class="text-caption text-muted-foreground italic capitalize">
            {{ note.category.replace(/_/g, " ") }}
          </p>
          <p v-if="preview(note)" class="text-caption text-muted-foreground line-clamp-2">{{ preview(note) }}</p>
        </RouterLink>
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconPin } from "@/lib/icons";
import { usePinnedNotes, type PinnedNote } from "@/composables/notes/useNotes";
import { extractTiptapText } from "@/lib/utils";
import DashboardWidget from "../DashboardWidget.vue";

/** Only the first four, asked of the database rather than sliced after loading
 *  every note: the dashboard shows what is pinned, the notes list is where you
 *  read them. */
const { data: pinnedNotes } = usePinnedNotes(4);

function preview(note: PinnedNote): string {
  return extractTiptapText(note.content, 120);
}
</script>
