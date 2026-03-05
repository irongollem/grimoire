<template>
  <RouterLink
    :to="to"
    class="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-4 hover:border-gold-700 transition-colors"
  >
    <div class="flex items-center justify-between">
      <span class="font-fell text-sm text-muted-foreground">{{ label }}</span>
      <component :is="icon" class="h-4 w-4 text-gold-600" />
    </div>
    <span class="font-cinzel text-2xl font-bold text-foreground">{{ value }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: string | number
  icon: Component
  to: string
}>()
</script>
