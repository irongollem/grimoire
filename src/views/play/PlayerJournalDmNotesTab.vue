<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <LoadingSpinner />
  </div>
  <div v-else-if="!dmNotes.length" class="text-center py-12">
    <IconPopulate class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">No notes shared by your DM yet.</p>
  </div>
  <div v-else class="flex flex-col gap-2">
    <JournalCard
      v-for="note in dmNotes"
      :key="note.id"
      :color="NOTE_CATEGORIES[note.category]?.color ?? '#6b7280'"
      :icon="NOTE_CATEGORIES[note.category]?.icon ?? IconPopulate"
      :category-label="NOTE_CATEGORIES[note.category]?.label ?? ''"
      :title="note.title"
      :date="formatDate(note.created_at)"
      :expanded="selectedNote === note.id"
      @toggle="$emit('toggleNote', note.id)"
    >
      <template #meta>
        <EntityNewDot :is-new="isNoteNew(note.id, note.updated_at)" title="New" />
        <IconPin v-if="note.is_pinned" class="h-2.5 w-2.5 text-primary shrink-0" />
        <span v-if="note.category === 'session' && note.session_num != null" class="text-caption text-muted-foreground/70 italic">Session {{ note.session_num }}</span>
        <span class="text-caption text-muted-foreground/70 italic">by DM</span>
      </template>
      <div class="px-4 py-4">
        <RichTextViewer :content="note.content ?? ''" />
        <div v-if="note.tags?.length" class="flex flex-wrap gap-1 mt-3">
          <span
            v-for="tag in note.tags"
            :key="tag"
            class="text-label md:text-sm px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          >{{ tag }}</span>
        </div>
      </div>
    </JournalCard>
  </div>
</template>

<script setup lang="ts">
import { IconPin, IconPopulate } from '@/lib/icons';
import JournalCard from '@/components/player/JournalCard.vue';
import EntityNewDot from '@/components/common/EntityNewDot.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import RichTextViewer from '@/components/common/RichTextViewer.vue';
import type { NoteCategory } from '@/types/notes.types';
import type { Note } from '@/types/notes.types';
import type { Component } from 'vue';

defineProps<{
  isLoading: boolean;
  dmNotes: Note[];
  selectedNote: string | null;
  isNoteNew: (id: string, updatedAt: string) => boolean;
  formatDate: (iso: string) => string;
  NOTE_CATEGORIES: Record<NoteCategory, { label: string; color: string; icon: Component }>;
}>();

defineEmits<{
  (e: 'toggleNote', id: string): void;
}>();
</script>
