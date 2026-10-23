<template>
  <EntityListRow
    :to="`/notes/${note.id}`"
    :title="note.title || 'Untitled Note'"
    :subtitle="subtitle"
    :fallback-icon="note.is_pinned ? IconPin : IconNavNotes"
    :tags="[note.category, ...note.tags]"
    :max-tags="4"
    :locked="locked"
  >
    <template v-if="preview" #body>
      <p class="mt-1 line-clamp-1 text-caption text-muted-foreground italic">{{ preview }}</p>
    </template>
    <template #actions>
      <AudienceRevealControl
        :name="note.title"
        :visible-to="note.player_visible_to"
        :book-entry="{ type: 'note', id: note.id }"
        form="inline"
        @change="reveal"
      />
      <!-- Manual sort, unpinned only; the list's VueDraggable grabs this. -->
      <span
        v-if="showHandle"
        class="note-drag-handle cursor-grab text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
        title="Drag to reorder"
      >
        <IconDrag class="h-3.5 w-3.5" />
      </span>
    </template>
  </EntityListRow>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import { useUpdateNote } from "@/composables/notes/useNotes";
import { useNoteSession } from "@/composables/notes/useNoteSession";
import { IconDrag, IconNavNotes, IconPin } from "@/lib/icons";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { timeAgo, extractTiptapText } from "@/lib/utils";
import type { Note } from "@/types/notes.types";

/** The row counterpart to `NoteCard`: same facts, one line each. */
const { note, locked = false, showHandle = false } = defineProps<{
  note: Note;
  locked?: boolean;
  showHandle?: boolean;
}>();

const session = useNoteSession(() => note.session_id);
const { mutate: updateNote } = useUpdateNote();

function reveal(playerVisibleTo: string[]) {
  updateNote({ id: note.id, update: { player_visible_to: playerVisibleTo } });
}

const subtitle = computed(() =>
  session.value
    ? `${sessionShortLabel(session.value)}, ${timeAgo(note.updated_at)}`
    : timeAgo(note.updated_at),
);
const preview = computed(() => extractTiptapText(note.content));
</script>
