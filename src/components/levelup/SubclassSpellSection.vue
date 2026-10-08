<template>
  <details class="group rounded-lg border border-border bg-card" :open="open">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
      <h2 class="text-label-lg uppercase text-muted-foreground">{{ title }}</h2>
      <span v-if="count > 0" class="text-caption text-primary">{{ count }} set</span>
      <span v-else class="text-caption text-muted-foreground/70">Empty</span>
    </summary>
    <div class="space-y-4 px-4 pb-4">
      <p class="text-body text-muted-foreground"><slot name="help" /></p>
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
/**
 * A titled, collapsible card for one of a subclass's spell maps. Granted spells
 * open by default; the variants and expanded list are advanced and most
 * subclasses leave them empty, so they start shut with a count of what's inside.
 */
const { title, open = false, count = 0 } = defineProps<{
  title: string;
  open?: boolean;
  /** How many entries the section holds, shown on the closed header. */
  count?: number;
}>();
</script>
