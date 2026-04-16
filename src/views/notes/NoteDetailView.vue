<template>
  <PageHeader
    :title="note?.title || (isNew ? 'New Note' : 'Loading…')"
    :description="note ? `${note.category}${note.session_num ? ' · Session ' + note.session_num : ''}` : undefined"
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
import { useNote } from "@/composables/useNotes";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NoteEditor from "@/components/notes/NoteEditor.vue";
import NoteSheet from "@/components/notes/NoteSheet.vue";

const route = useRoute();
const isNew = computed(() => route.name === "note-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const { data: note, isLoading: noteLoading } = useNote(id);
const isLoading = computed(() => !isNew.value && noteLoading.value);
</script>
