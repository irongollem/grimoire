<template>
  <div>
    <PageHeader
      :title="isNew ? 'New Note' : 'Edit Note'"
      :description="isNew ? 'Record your thoughts, lore, and session events' : undefined"
    />
    <NoteEditor />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'

const route = useRoute()
const isNew = computed(() => route.name === 'note-new')
</script>
