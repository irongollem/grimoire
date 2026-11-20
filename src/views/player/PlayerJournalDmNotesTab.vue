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
      :color="note.session_id !== null ? SESSION_COLOR : NOTE_COLOR"
      :icon="note.session_id !== null ? IconCalendarDays : IconDocument"
      :category-label="note.session_id !== null ? 'Session' : 'Note'"
      :title="note.title"
      :date="formatDate(note.created_at)"
      :expanded="selectedNote === note.id"
      @toggle="$emit('toggleNote', note.id)"
    >
      <template #meta>
        <EntityNewDot :is-new="isNoteNew(note.id, note.updated_at)" title="New" />
        <IconPin v-if="note.is_pinned" class="h-2.5 w-2.5 text-primary shrink-0" />
        <span v-if="sessionNameOf(note.session_id)" class="text-caption text-muted-foreground/70 italic">{{ sessionNameOf(note.session_id) }}</span>
        <span class="text-caption text-muted-foreground/70 italic">by DM</span>
        <AiGeneratedBadge variant="line" :provenance="note.ai_provenance" />
      </template>
      <div class="px-4 py-4">
        <NoteReading :note="note" class="mb-3" />
        <RichTextViewer :content="note.content ?? ''" />
        <TagChips :tags="note.tags ?? []" class="mt-3" />
      </div>
    </JournalCard>
    </template>
  </VirtualGrid>
</template>

<script setup lang="ts">
import TagChips from "@/components/common/TagChips.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { IconCalendarDays, IconDocument, IconPin, IconPopulate } from '@/lib/icons';
import JournalCard from '@/components/player/JournalCard.vue';
import EntityNewDot from '@/components/common/entity/EntityNewDot.vue';
import RichTextViewer from '@/components/common/richtext/RichTextViewer.vue';
import NoteReading from '@/components/notes/NoteReading.vue';
import AiGeneratedBadge from '@/components/common/ai/AiGeneratedBadge.vue';
import type { Note } from '@/types/notes.types';
import { usePlayerSessions } from '@/composables/sessions/usePlayerSessions';
import { sessionOf } from '@/lib/notes/noteSessions';
import { sessionLabel } from '@/lib/sessions/sessionLabel';

defineProps<{
  isLoading: boolean;
  dmNotes: Note[];
  selectedNote: string | null;
  isNoteNew: (id: string, updatedAt: string) => boolean;
  formatDate: (iso: string) => string;
}>();

defineEmits<{
  (e: 'toggleNote', id: string): void;
}>();

// The DM shares notes every session, so the list is windowed. An expanded note
// grows its row and is re-measured. Collapsed row height before measurement
// (px): 2 border + 2 category rule (h-0.5) + 24 padding (py-3) + 20 title
// (text-heading-xs) + 6 (mt-1.5) + 16 meta line (text-caption "by DM") = 70.
const NOTE_ROW_PX = 70;
// A note linked to a session is that session's chronicle entry; any other is a plain note.
const SESSION_COLOR = '#3b82f6';
const NOTE_COLOR = '#6b7280';
const noteKey = (note: Note) => note.id;

const { data: sessions } = usePlayerSessions();

/** The shared note's session, as a player may name it; null for a note with none. */
function sessionNameOf(sessionId: string | null): string | null {
  const session = sessionOf(sessions.value, sessionId);
  return session ? sessionLabel(session) : null;
}
</script>
