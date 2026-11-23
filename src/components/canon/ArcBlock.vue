<template>
  <section class="flex flex-col gap-1.5 border border-border bg-card p-3" :data-testid="`arc-block-${block}`">
    <span class="text-eyebrow text-muted-foreground">{{ title }}</span>
    <ul v-if="count > 0" class="m-0 flex list-none flex-col gap-1.5 p-0"><slot /></ul>
    <p v-else class="m-0 text-caption text-muted-foreground">{{ empty }}</p>
  </section>
</template>

<script setup lang="ts">
/** One titled list on an arc's page: its rows in the slot, or a quiet line when the arc holds none. */
defineProps<{ title: string; empty: string; count: number; block: string }>();
</script>
