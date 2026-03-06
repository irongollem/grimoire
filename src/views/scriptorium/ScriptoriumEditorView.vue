<template>
  <div>
    <PageHeader
      :title="doc?.title || (isNew ? 'New Document' : 'Edit Document')"
      description="Write with the quill of a master scribe"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <ScriptoriumEditor v-else :doc="isNew ? null : (doc ?? null)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useScriptoriumDocument } from '@/composables/useScriptorium'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import ScriptoriumEditor from '@/components/scriptorium/ScriptoriumEditor.vue'

const route = useRoute()
const isNew = computed(() => route.name === 'scriptorium-new')
const id = computed(() => isNew.value ? '' : (route.params.id as string))

const { data: doc, isLoading: docLoading } = useScriptoriumDocument(id.value)

const isLoading = computed(() => !isNew.value && docLoading.value)
</script>
