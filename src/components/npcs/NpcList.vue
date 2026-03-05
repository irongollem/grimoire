<template>
  <EmptyState
    title="No NPCs yet"
    description="Populate your realm with merchants, villains, sages, and more."
  >
    <template #action>
      <RouterLink
        to="/npcs/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        Add your first NPC
      </RouterLink>
    </template>
  </EmptyState>
</template>

<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
</script>
