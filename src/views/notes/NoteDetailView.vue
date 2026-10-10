<template>
  <PageHeader
    :title="note?.title || (isNew ? 'New Note' : 'Loading…')"
    :description="description"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <NoteEditor v-else-if="isNew || isEditing" :note="isNew ? null : (note ?? null)" />
    <NoteSheet v-else-if="note" :note="note" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useNote } from "@/composables/notes/useNotes";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import NoteEditor from "@/components/notes/NoteEditor.vue";
import NoteSheet from "@/components/notes/NoteSheet.vue";
import { useNoteSession } from "@/composables/notes/useNoteSession";
import { sessionLabel } from "@/lib/sessions/sessionLabel";

const route = useRoute();
const isNew = computed(() => route.name === "note-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const { data: note, isLoading: noteLoading } = useNote(id);
const session = useNoteSession(() => note.value?.session_id);
const description = computed(() => {
  if (!note.value) return undefined;
  return session.value ? `${note.value.category} · ${sessionLabel(session.value)}` : note.value.category;
});
const isLoading = computed(() => !isNew.value && noteLoading.value);
</script>
