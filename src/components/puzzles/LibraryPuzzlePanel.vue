<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">{{ title }}</span>
    </div>
    <div :class="flush ? '' : 'p-4'"><slot /></div>
  </div>
</template>

<script setup lang="ts">
// The titled card the puzzle sheets stack; `flush` for bodies that bring their own padding.
const { title, flush = false } = defineProps<{ title: string; flush?: boolean }>();
</script>
