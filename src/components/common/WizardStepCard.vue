<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div v-if="title || $slots.header" class="flex items-center justify-between gap-2">
      <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">{{ title }}</h3>
      <slot name="header" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>
