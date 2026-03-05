<template>
  <EmptyState
    title="The scriptorium awaits"
    description="Craft monsters, spells, items, and adventure documents with the look of the official books."
  >
    <template #action>
      <RouterLink
        to="/scriptorium/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        Create your first document
      </RouterLink>
    </template>
  </EmptyState>
</template>

<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
</script>
