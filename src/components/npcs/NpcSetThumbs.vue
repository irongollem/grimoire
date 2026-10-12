<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <img
      v-for="npc in previewMembers"
      :key="npc.id"
      class="size-9 rounded-md border border-border bg-muted object-cover"
      :src="portrait(npc)"
      :alt="displayName(npc)"
      :title="displayName(npc)"
      loading="lazy"
      @error="onImgError"
    />
    <span
      v-if="overflowCount"
      class="flex size-9 items-center justify-center rounded-md border border-border bg-muted text-label-lg font-semibold text-muted-foreground"
    >+{{ overflowCount }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * The strip of member portraits on an NPC set, in the card and in the row: the
 * first few NPCs in playlist order, then a "+N" chip.
 */
import { computed } from "vue";
import { getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { NpcListRow } from "@/types/npc.types";

const { members, max = 6 } = defineProps<{
  members: NpcListRow[];
  /** Portraits shown before the rest collapse into "+N". */
  max?: number;
}>();

const PLACEHOLDER = placeholderUrl("npc");

const previewMembers = computed(() => members.slice(0, max));
const overflowCount = computed(() => Math.max(0, members.length - max));

function displayName(npc: NpcListRow): string {
  return getNpcDisplayName(npc) ?? "???";
}
function portrait(npc: NpcListRow): string {
  return getNpcDisplayPortrait(npc) || PLACEHOLDER;
}
function onImgError(e: Event) {
  (e.target as HTMLImageElement).src = PLACEHOLDER;
}
</script>
