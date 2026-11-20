<template>
  <QuestClockDial v-if="force.clock_size !== null" :label="`${force.title} clock`" :segments="force.clock_size" :filled="clockFilled(ticks, force.clock_size)" />
  <!-- No clock: the dial's empty ring, as the frame draws it. -->
  <svg v-else viewBox="0 0 40 40" role="img" aria-label="No clock" class="size-10 shrink-0 text-border">
    <circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" />
  </svg>
</template>

<script setup lang="ts">
/** A force's clock: the quest clock dial filled by the sum of its ticks, or the empty ring when it keeps none. */
import QuestClockDial from "@/components/quests/inspector/QuestClockDial.vue";
import { clockFilled } from "@/composables/canon/useCanonForces";
import type { CanonEntry, CanonForceTick } from "@/types/canon.types";

defineProps<{ force: CanonEntry; ticks: readonly CanonForceTick[] }>();
</script>
