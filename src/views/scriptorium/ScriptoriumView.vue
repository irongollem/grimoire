<template>
  <div>
    <PageHeader title="Scriptorium" description="Craft spell scrolls, stat blocks, and campaign documents">
      <template #actions>
        <RouterLink
          to="/scriptorium/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Document
        </RouterLink>
      </template>
    </PageHeader>

    <ScriptoriumDocumentList />
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import ScriptoriumDocumentList from '@/components/scriptorium/ScriptoriumDocumentList.vue'
</script>
