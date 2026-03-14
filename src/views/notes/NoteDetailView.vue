<template>
  <div>
    <PageHeader
      :title="note?.title || (isNew ? 'New Note' : 'Loading…')"
      :description="note ? `${note.category}${note.session_num ? ' · Session ' + note.session_num : ''}` : undefined"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <NoteEditor v-else :note="isNew ? null : (note ?? null)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useNote } from "@/composables/useNotes";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NoteEditor from "@/components/notes/NoteEditor.vue";

const route  = useRoute();
const isNew  = computed(() => route.name === "note-new");
const id     = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: note, isLoading: noteLoading } = useNote(id.value);
const isLoading = computed(() => !isNew.value && noteLoading.value);
</script>
