<template>
  <span
    v-if="size === 'lg'"
    class="flex size-8 shrink-0 items-center justify-center border border-border bg-secondary font-cinzel text-body font-bold text-muted-foreground"
    aria-hidden="true"
  >{{ letter }}</span>
  <span v-else class="inline-flex items-center gap-1 whitespace-nowrap rounded-xs border border-border bg-muted/40 py-px pr-2 pl-0.5 text-label text-foreground">
    <span class="flex size-4 items-center justify-center rounded-xs bg-secondary text-caption-sm font-bold text-muted-foreground" aria-hidden="true">{{ letter }}</span>
    {{ name }}
  </span>
</template>

<script setup lang="ts">
/**
 * One person, faction, place or beat named beside a truth ("Known to") or a clue ("where it lies"), as the design draws a world-web reference. `size="lg"` is
 * the thumbnail badge alone (the "F" or "P" in a slip), for a row that sets the name beside it itself.
 */
import { computed } from "vue";
import type { ConnectionKind } from "@edge-shared/worldLinkCatalogue.ts";

const { kind, name, size = "sm" } = defineProps<{ kind: ConnectionKind | "quest_beat"; name: string; size?: "sm" | "lg" }>();

const LETTER: Record<ConnectionKind | "quest_beat", string> = {
  npc: "P", party_member: "P", faction: "F", location: "L", deity: "D", item: "I", canon: "C", quest: "Q", quest_beat: "B",
};
const letter = computed(() => LETTER[kind]);
</script>
