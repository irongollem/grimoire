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
      <RouterLink to="/billing" class="font-cinzel text-[0.5625rem] tracking-wider text-primary/80 hover:text-primary transition-colors">
        Upgrade to access
      </RouterLink>
    </div>

    <!-- Category colour bar -->
    <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: categoryColor(note.category) }" />

    <div class="p-3 flex flex-col gap-2 flex-1">
      <!-- Title row -->
      <div class="flex items-start gap-1.5">
        <IconPin v-if="note.is_pinned" class="h-3 w-3 shrink-0 mt-0.5 text-primary" />
        <IconReveal v-if="note.player_visible_to?.length" class="h-3 w-3 shrink-0 mt-0.5 text-elven-green" />
        <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
          {{ note.title || "Untitled Note" }}
        </h3>
      </div>

      <!-- Category + session -->
      <div class="flex items-center gap-2">
        <span
          class="px-1.5 py-0.5 rounded text-label font-bold capitalize"
          :style="{ backgroundColor: categoryColor(note.category) + '22', color: categoryColor(note.category) }"
        >
          {{ note.category }}
        </span>
        <span v-if="note.session_num" class="font-fell text-xs text-muted-foreground italic">
          Session {{ note.session_num }}
        </span>
      </div>

      <!-- Content preview -->
      <p v-if="preview" class="font-fell text-xs text-muted-foreground italic line-clamp-3 flex-1">
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
        <span class="font-fell text-2xs text-muted-foreground italic shrink-0 ml-auto">
          {{ timeAgo(note.updated_at) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconDrag, IconLock, IconPin, IconReveal } from "@/lib/icons";
import { timeAgo, extractTiptapText } from "@/lib/utils";
import type { Note, NoteCategory } from "@/types/notes.types";

const { note, locked = false, showHandle = false } = defineProps<{
  note: Note;
  locked?: boolean;
  showHandle?: boolean;
}>();

const CATEGORY_COLORS: Record<NoteCategory, string> = {
  general:  "#6b7280",
  session:  "#2563eb",
  lore:     "#7c3aed",
  location: "#059669",
  quest:    "#d97706",
  faction:  "#dc2626",
};

function categoryColor(cat: NoteCategory): string {
  return CATEGORY_COLORS[cat] ?? "#6b7280";
}

const preview = computed(() => extractTiptapText(note.content));
</script>
