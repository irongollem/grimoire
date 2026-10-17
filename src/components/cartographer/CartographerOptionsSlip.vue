<template>
  <div
    data-slip
    class="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border bg-card/95 px-3 py-1.5 shadow-md lg:right-auto lg:max-w-[min(42rem,calc(100%-1rem))]"
  >
    <!-- Floating at the canvas's top left, where the eye lands: the active tool by name,
         then whatever that tool offers, in one line that wraps rather than a panel that
         takes a column. `data-slip` draws it as a torn slip (Vellum ink). -->
    <span class="text-label-lg font-semibold text-foreground">{{ title }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
</script>
