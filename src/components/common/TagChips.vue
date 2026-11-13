<template>
  <div v-if="tags.length" class="flex flex-wrap gap-1">
    <TagChip v-for="(tag, i) in shown" :key="i">{{ tag }}</TagChip>
    <span v-if="overflow && hidden > 0" class="self-center text-caption-sm text-muted-foreground italic">+{{ hidden }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * A row of tag chips (#1185): a card's or a row's tags, a sheet's tag line.
 * Renders nothing when there are no tags, so a caller needs no `v-if` of its
 * own. `max` caps how many show; `overflow` adds a quiet "+N" for the rest
 * (an NPC card does, a list row does not). Spacing around the row (`mt-auto
 * pt-1`) is a class at the call site.
 */
import { computed } from "vue";
import TagChip from "./TagChip.vue";

const { tags, max, overflow = false } = defineProps<{
  tags: readonly string[];
  /** Show at most this many. */
  max?: number;
  /** Say how many were left out, as "+N". */
  overflow?: boolean;
}>();

const shown = computed(() => (max === undefined ? tags : tags.slice(0, max)));
const hidden = computed(() => tags.length - shown.value.length);
</script>
