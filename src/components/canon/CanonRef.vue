<template>
  <span
    v-if="size === 'lg'"
    class="flex size-8 shrink-0 items-center justify-center border border-border bg-secondary font-cinzel text-body font-bold text-muted-foreground"
    aria-hidden="true"
  >{{ letter }}</span>
  <span v-else class="inline-flex items-center gap-1 whitespace-nowrap rounded-xs border border-border bg-muted/40 py-px pr-2 pl-0.5 text-label text-foreground">
    <span class="flex size-4 items-center justify-center rounded-xs bg-secondary text-[0.5625rem] font-bold text-muted-foreground" aria-hidden="true">{{ letter }}</span>
    {{ name }}
  </span>
</template>

<script setup lang="ts">
/**
 * One person or faction named beside a truth ("Known to"), as the design draws a world-web reference. `size="lg"` is
 * the thumbnail badge alone (the "F" or "P" in a slip), for a row that sets the name beside it itself.
 */
import { computed } from "vue";
import type { ConnectionKind } from "@edge-shared/worldLinkCatalogue.ts";

const { kind, name, size = "sm" } = defineProps<{ kind: ConnectionKind; name: string; size?: "sm" | "lg" }>();

const letter = computed(() => (kind === "faction" ? "F" : "P"));
</script>
