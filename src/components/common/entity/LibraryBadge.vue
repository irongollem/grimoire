<template>
  <span
    :title="title"
    class="rounded border px-1 py-0.5 text-label font-bold"
    :class="tone === 'overlay'
      ? 'border-border bg-card/90 text-foreground'
      : 'border-border bg-muted text-muted-foreground'"
  >
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup lang="ts">
/**
 * The pill that marks a row as shared library content. `inline` sits in a card's
 * text; `overlay` sits over artwork and needs the card surface to stay legible.
 * Position (absolute corners, max width, shrink) is a class at the call site.
 */
const { label = "Library", title, tone = "inline" } = defineProps<{
  label?: string;
  title?: string;
  tone?: "inline" | "overlay";
}>();
</script>
