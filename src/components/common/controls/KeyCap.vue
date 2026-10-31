<template>
  <kbd
    :class="cn(
      'font-mono text-caption-sm leading-none',
      corner
        ? 'absolute right-1 top-0.5 text-muted-foreground'
        : 'rounded border border-border bg-secondary/40 px-1 text-foreground',
    )"
    aria-hidden="true"
  ><slot /></kbd>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";

/**
 * A key as it is printed in help text and on tools. `corner` is the bare form pinned
 * to the top right of a `relative` parent (a `size="tile"` button), with no cap
 * around it. Decorative: the shortcut is also in the tool's tooltip.
 */
const { corner = false } = defineProps<{ corner?: boolean }>();
</script>
