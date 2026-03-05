<template>
  <div class="h-full flex flex-col">
    <PageHeader
      :title="isNew ? 'New Document' : 'Edit Document'"
      description="Write with the quill of a master scribe"
    />
    <ScriptoriumEditor />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import ScriptoriumEditor from '@/components/scriptorium/ScriptoriumEditor.vue'

const route = useRoute()
const isNew = computed(() => route.name === 'scriptorium-new')
</script>
