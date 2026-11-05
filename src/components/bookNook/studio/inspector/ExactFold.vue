<template>
  <details class="group rounded-md border border-border bg-muted/30">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 text-label uppercase text-muted-foreground">
      Exact
      <IconChevronDown class="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div class="flex flex-col gap-2 border-t border-border px-3 py-2 text-caption text-muted-foreground">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
import { IconChevronDown } from "@/lib/icons";

/** The engine's own numbers, closed until asked for: the friendly controls above stay the way in. */
</script>
