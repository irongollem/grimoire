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
    <!-- What comes next stays in view however long the body is: the routes out
         of a beat, a quest's objectives (#1194, frames 09 and 11). -->
    <footer v-if="$slots.foot" class="shrink-0 border-t-2 border-foreground bg-muted/40 px-5 pb-4 pt-3">
      <slot name="foot" />
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * The drawer's column (#1194): the same frame whether it holds the quest, a beat
 * or a route, small or with the wide part beside it. Header for who and where,
 * a body that scrolls on its own, and a foot pinned below it.
 */
const { label } = defineProps<{ label: string }>();
defineSlots<{ header(): unknown; default(): unknown; foot?(): unknown }>();
</script>
