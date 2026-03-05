<template>
  <div>
    <PageHeader title="Campaign Notes" description="Session logs, lore, and secrets of the realm">
      <template #actions>
        <RouterLink
          to="/notes/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New Note
        </RouterLink>
      </template>
    </PageHeader>

    <NotesList />
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import NotesList from '@/components/notes/NotesList.vue'
</script>
