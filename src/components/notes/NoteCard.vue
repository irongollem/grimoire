<template>
  <div
    class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
  >
    <!-- Card link overlay (disabled for locked items) -->
    <RouterLink v-if="!locked" :to="`/notes/${note.id}`" class="absolute inset-0 z-2" />

    <!-- Drag handle (manual sort, unpinned only) -->
    <div
      v-if="showHandle"
      class="note-drag-handle absolute top-1.5 right-1.5 z-10 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/80 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
      title="Drag to reorder"
    >
      <IconDrag class="h-3.5 w-3.5" />
    </div>

    <!-- Locked overlay for over-quota items -->
    <div
      v-if="locked"
      class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
    >
      <IconLock class="h-4 w-4 text-muted-foreground" />
      <p class="text-label font-semibold text-muted-foreground">Locked</p>
      <RouterLink to="/billing" class="text-label text-primary/80 hover:text-primary transition-colors">
        Upgrade to access
      </RouterLink>
    </div>

    <!--
      Reveal, over the category bar. Was a bare `IconReveal` beside the title
      that said whether the note was shared but could not change it.
    -->
    <div class="absolute top-1.5 left-1.5 z-10" @click.prevent.stop>
      <AudienceRevealControl
        :name="note.title"
        :visible-to="note.player_visible_to"
        form="overlay"
        @change="reveal"
      />
    </div>

    <!-- Category colour bar -->
    <div class="h-1.5 w-full shrink-0" :class="CATEGORY_BG[note.category]" />

    <div class="p-3 flex flex-col gap-2 flex-1">
      <!-- Title row -->
      <div class="flex items-start gap-1.5">
        <IconPin v-if="note.is_pinned" class="h-3 w-3 shrink-0 mt-0.5 text-primary" />
        <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
          {{ note.title || "Untitled Note" }}
        </h3>
      </div>

      <!-- Category + session -->
      <div class="flex items-center gap-2">
        <span
          class="relative px-1.5 py-0.5 rounded text-label font-bold capitalize"
          :class="CATEGORY_TEXT[note.category]"
        >
          <span class="absolute inset-0 rounded opacity-15" :class="CATEGORY_BG[note.category]" />
          <span class="relative">{{ note.category }}</span>
        </span>
        <span v-if="note.session_num" class="text-caption text-muted-foreground italic">
          Session {{ note.session_num }}
        </span>
      </div>

      <!-- Content preview -->
      <p v-if="preview" class="text-caption text-muted-foreground italic line-clamp-3 flex-1">
        {{ preview }}
      </p>
      <div v-else class="flex-1" />

      <!-- Tags + date -->
      <div class="flex items-end justify-between gap-2 mt-auto">
        <div v-if="note.tags.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in note.tags.slice(0, 2)"
            :key="tag"
            class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
          >
            {{ tag }}
          </span>
        </div>
        <span class="text-caption-sm text-muted-foreground italic shrink-0 ml-auto">
          {{ timeAgo(note.updated_at) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import { useUpdateNote } from "@/composables/useNotes";
import { IconDrag, IconLock, IconPin } from "@/lib/icons";
import { timeAgo, extractTiptapText } from "@/lib/utils";
import type { Note, NoteCategory } from "@/types/notes.types";

const { note, locked = false, showHandle = false } = defineProps<{
  note: Note;
  locked?: boolean;
  showHandle?: boolean;
}>();

const { mutate: updateNote } = useUpdateNote();

function reveal(playerVisibleTo: string[]) {
  updateNote({ id: note.id, update: { player_visible_to: playerVisibleTo } });
}

const CATEGORY_BG: Record<NoteCategory, string> = {
  general:     "bg-note-general",
  session:     "bg-note-session",
  lore:        "bg-note-lore",
  location:    "bg-note-location",
  quest:       "bg-note-quest",
  faction:     "bg-note-faction",
};

/** Text-colour classes for the same ramp. */
const CATEGORY_TEXT: Record<NoteCategory, string> = {
  general:     "text-note-general",
  session:     "text-note-session",
  lore:        "text-note-lore",
  location:    "text-note-location",
  quest:       "text-note-quest",
  faction:     "text-note-faction",
};


const preview = computed(() => extractTiptapText(note.content));
</script>
