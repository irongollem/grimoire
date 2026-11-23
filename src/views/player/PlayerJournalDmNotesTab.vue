<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <div v-else-if="!listed.length" class="text-center py-12">
    <IconPopulate class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">No notes shared by your DM yet.</p>
  </div>
  <VirtualGrid
    v-else
    :items="listed"
    :item-key="noteKey"
    :columns="1"
    :estimate-row-height="NOTE_ROW_PX"
    :gap="0.5"
  >
    <template #default="{ item: note }">
    <JournalCard
      :id="`dm-note-${note.id}`"
      :color="NOTE_COLOR"
      :icon="IconDocument"
      category-label="Note"
      :title="note.title"
      :date="formatDate(note.created_at)"
      :expanded="selectedNote === note.id"
      @toggle="$emit('toggleNote', note.id)"
    >
      <template #meta>
        <EntityNewDot :is-new="isNoteNew(note.id, note.updated_at)" title="New" />
        <IconPin v-if="note.is_pinned" class="h-2.5 w-2.5 text-primary shrink-0" />
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
import { computed } from "vue";
import TagChips from "@/components/common/TagChips.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { IconDocument, IconPin, IconPopulate } from '@/lib/icons';
import JournalCard from '@/components/player/JournalCard.vue';
import EntityNewDot from '@/components/common/entity/EntityNewDot.vue';
import RichTextViewer from '@/components/common/richtext/RichTextViewer.vue';
import NoteReading from '@/components/notes/NoteReading.vue';
import AiGeneratedBadge from '@/components/common/ai/AiGeneratedBadge.vue';
import type { Note } from '@/types/notes.types';
import { listedNotes } from '@/lib/notes/noteSessions';

const { dmNotes } = defineProps<{
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
// A note linked to a session is that session's chronicle entry, read in The World; only plain notes are listed here.
const NOTE_COLOR = '#6b7280';
const noteKey = (note: Note) => note.id;

const listed = computed(() => listedNotes(dmNotes));
</script>
