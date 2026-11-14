<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col" :aria-label="label">
    <header class="flex shrink-0 flex-col gap-2 border-b border-border px-5 pb-3 pt-5">
      <slot name="header" />
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div class="flex flex-col gap-3">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The drawer's column (#1194): the same frame whether it holds the quest, a beat
 * or a route, small or with the wide part beside it: a header for who and
 * where, and one body that scrolls. Nothing is pinned below it: a pinned foot
 * took the column's height from the text above it (14 Nov 2026).
 */
const { label } = defineProps<{ label: string }>();
defineSlots<{ header(): unknown; default(): unknown }>();
</script>
