<template>
  <EmptyState
    title="No notes yet"
    description="Begin recording your campaign's history, lore, and secrets."
  >
    <template #action>
      <RouterLink
        to="/notes/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        Write your first note
      </RouterLink>
    </template>
  </EmptyState>
</template>

<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
</script>
