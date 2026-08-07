<template>
  <section class="flex flex-col gap-3">
    <div>
      <h2 class="text-heading text-foreground">{{ title }}</h2>
      <p v-if="note" class="text-caption text-muted-foreground max-w-3xl">{{ note }}</p>
    </div>
    <div class="rounded-md border border-border bg-card p-4">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * One titled block in the component catalogue (#622). Split out purely so the
 * catalogue view stays a list of specimens rather than a list of specimens
 * interleaved with heading markup.
 */
defineProps<{
  title: string;
  /** What to look at, or what regressed here before. */
  note?: string;
}>();
</script>
