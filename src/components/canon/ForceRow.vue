<template>
  <CanonLedgerRow :id="`canon-entry-${entry.id}`" :label="entry.title" :selected="selected" @select="emit('select')">
    <ForceClock :force="entry" :ticks="ticks" />
    <span class="min-w-0 flex-1">
      <span class="flex flex-wrap items-baseline gap-x-2">
        <span class="text-body font-semibold leading-snug text-foreground">{{ entry.title }}</span>
        <span v-if="entry.clock_size !== null" class="text-label text-muted-foreground" data-testid="force-clock-tally">
          {{ clockFilled(ticks, entry.clock_size) }} of {{ entry.clock_size }}
        </span>
        <span v-else class="text-label text-muted-foreground">no clock</span>
      </span>
      <span v-if="outcome !== null" class="mt-0.5 block text-caption font-bold text-foreground" data-testid="force-outcome">
        {{ FORCE_OUTCOME_ENDED[outcome] }}<template v-if="entry.closed_note !== null"> · {{ entry.closed_note }}</template>
      </span>
      <span v-if="entry.wants" class="mt-0.5 block text-caption text-muted-foreground">
        <span class="font-bold text-foreground">Wants</span> {{ entry.wants }}
      </span>
      <span class="mt-0.5 block text-caption text-muted-foreground" data-testid="force-step-reached">
        <template v-if="reached"><span class="font-bold text-foreground">Now</span> {{ reached.title }}</template>
        <template v-else-if="steps.length > 0">No step reached yet</template>
        <template v-else>No steps yet</template>
      </span>
    </span>
  </CanonLedgerRow>
</template>

<script setup lang="ts">
/** One force in the list (frame 06): who, what it wants, its clock dial and the step it has reached. */
import CanonLedgerRow from "./CanonLedgerRow.vue";
import { computed } from "vue";
import ForceClock from "./ForceClock.vue";
import { FORCE_OUTCOME_ENDED, forceOutcome } from "@/lib/canon/canonClose";
import { clockFilled, stepReached } from "@/composables/canon/useCanonForces";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

const { entry, steps, ticks, selected = false } = defineProps<{
  entry: CanonEntry;
  steps: readonly CanonForceStep[];
  ticks: readonly CanonForceTick[];
  selected?: boolean;
}>();
const emit = defineEmits<{ select: [] }>();

const reached = computed(() => stepReached(steps));
const outcome = computed(() => forceOutcome(entry));
</script>
