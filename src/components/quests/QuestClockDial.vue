<template>
  <svg
    viewBox="0 0 40 40"
    role="img"
    :aria-label="`${label}: ${clockProgressLabel(filled, segments)}`"
    class="shrink-0"
    :class="small ? 'h-7 w-7' : 'h-10 w-10'"
  >
    <path
      v-for="index in segments"
      :key="index"
      :d="clockSegmentPath(index - 1, segments, 20, 18, 9)"
      :class="index <= filled ? 'fill-primary' : 'fill-muted'"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * A progress clock drawn as a ring of equal segments, filled clockwise (#1011).
 * Display only; ticking is the cockpit's job (`QuestRunClocks.vue`) and
 * authoring is `QuestClocksPanel.vue`.
 */
import { clockProgressLabel, clockSegmentPath } from "@/lib/quests/clockDial";

const { label, segments, filled, small = false } = defineProps<{
  label: string;
  segments: number;
  filled: number;
  small?: boolean;
}>();
</script>
