<template>
  <section class="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
    <h3 v-if="title" class="text-eyebrow uppercase text-muted-foreground">{{ title }}</h3>
    <slot />
  </section>
</template>

<script setup lang="ts">
/** One group of the panel: a small-caps eyebrow over its controls, ruled off from the next. */
defineProps<{ title?: string }>();
</script>
