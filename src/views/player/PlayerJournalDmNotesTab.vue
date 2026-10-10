<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <div v-else-if="!dmNotes.length" class="text-center py-12">
    <IconPopulate class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">No notes shared by your DM yet.</p>
  </div>
  <VirtualGrid
    v-else
    :items="dmNotes"
    :item-key="noteKey"
    :columns="1"
    :estimate-row-height="NOTE_ROW_PX"
    :gap="0.5"
  >
    <template #default="{ item: note }">
    <JournalCard
      :id="`dm-note-${note.id}`"
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
        <span v-if="note.category === 'session' && sessionNameOf(note.session_id)" class="text-caption text-muted-foreground/70 italic">{{ sessionNameOf(note.session_id) }}</span>
        <span class="text-caption text-muted-foreground/70 italic">by DM</span>
        <AiGeneratedBadge variant="line" :provenance="note.ai_provenance" />
      </template>
      <div class="px-4 py-4">
        <RichTextViewer :content="note.content ?? ''" />
        <div v-if="note.tags?.length" class="flex flex-wrap gap-1 mt-3">
          <span
            v-for="tag in note.tags"
            :key="tag"
            class="text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          >{{ tag }}</span>
        </div>
      </div>
    </JournalCard>
    </template>
  </VirtualGrid>
</template>

<script setup lang="ts">
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { IconPin, IconPopulate } from '@/lib/icons';
import JournalCard from '@/components/player/JournalCard.vue';
import EntityNewDot from '@/components/common/entity/EntityNewDot.vue';
import RichTextViewer from '@/components/common/richtext/RichTextViewer.vue';
import AiGeneratedBadge from '@/components/common/ai/AiGeneratedBadge.vue';
import type { NoteCategory } from '@/types/notes.types';
import type { Note } from '@/types/notes.types';
import type { Component } from 'vue';
import { usePlayerSessions } from '@/composables/sessions/usePlayerSessions';
import { sessionOf } from '@/lib/notes/noteSessions';
import { sessionLabel } from '@/lib/sessions/sessionLabel';

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

// The DM shares notes every session, so the list is windowed. An expanded note
// grows its row and is re-measured. Collapsed row height before measurement
// (px): 2 border + 2 category rule (h-0.5) + 24 padding (py-3) + 20 title
// (text-heading-xs) + 6 (mt-1.5) + 16 meta line (text-caption "by DM") = 70.
const NOTE_ROW_PX = 70;
const noteKey = (note: Note) => note.id;

const { data: sessions } = usePlayerSessions();

/** The shared note's session, as a player may name it; null for a note with none. */
function sessionNameOf(sessionId: string | null): string | null {
  const session = sessionOf(sessions.value, sessionId);
  return session ? sessionLabel(session) : null;
}
</script>
