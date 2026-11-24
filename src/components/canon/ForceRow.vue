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
      <span v-if="who !== null && who !== entry.title" class="mt-0.5 block text-caption text-muted-foreground" data-testid="force-who">
        <span class="font-bold text-foreground">Who</span> {{ who }}
      </span>
      <span v-if="outcome !== null" class="mt-0.5 block text-caption font-bold text-foreground" data-testid="force-outcome">
        {{ FORCE_OUTCOME_ENDED[outcome] }}<template v-if="entry.closed_note !== null"> · {{ entry.closed_note }}</template>
      </span>
      <span v-if="entry.wants" class="mt-0.5 block text-caption text-muted-foreground">
        <span class="font-bold text-foreground">Wants</span> {{ entry.wants }}
      </span>
      <span v-if="late !== null" class="mt-0.5 block text-caption text-muted-foreground" data-testid="force-overdue">{{ late }}</span>
      <span class="mt-0.5 block text-caption text-muted-foreground" data-testid="force-step-reached">
        <template v-if="reached"><span class="font-bold text-foreground">Now</span> {{ reached.title }}</template>
        <template v-else-if="steps.length > 0">No step reached yet</template>
        <template v-else>No steps yet</template>
      </span>
    </span>
    <CanonMoveButtons v-if="move" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
  </CanonLedgerRow>
</template>

<script setup lang="ts">
/**
 * One force in the list (frame 06): what it is doing, the faction behind it (by its current name), what it wants, its
 * clock dial and the step it has reached, and, once the campaign's date has passed a step's due date, a quiet line saying so.
 */
import CanonLedgerRow from "./CanonLedgerRow.vue";
import { computed } from "vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import ForceClock from "./ForceClock.vue";
import { FORCE_OUTCOME_ENDED, forceOutcome } from "@/lib/canon/canonClose";
import { clockFilled, firstOverdueStep, overdueLine } from "@/lib/canon/canonForces";
import { useWorldToday } from "@/composables/canon/useWorldToday";
import { useCalendarStore } from "@/stores/calendar";
import { stepReached } from "@/composables/canon/useCanonForces";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

const { entry, steps, ticks, who = null, selected = false, move = null } = defineProps<{
  entry: CanonEntry;
  steps: readonly CanonForceStep[];
  ticks: readonly CanonForceTick[];
  /** The linked faction's name as it is now, or null when no faction is behind it. */
  who?: string | null;
  selected?: boolean;
  /** Up and down, offered only while nothing narrows the list; `null` hides them. */
  move?: { first: boolean; last: boolean } | null;
}>();
const emit = defineEmits<{ select: []; move: [direction: -1 | 1] }>();

const reached = computed(() => stepReached(steps));
const outcome = computed(() => forceOutcome(entry));

const today = useWorldToday();
const calendar = useCalendarStore();
// An ended force moves no further, so what it never reached is not late.
const late = computed(() => {
  const step = outcome.value === null ? firstOverdueStep(steps, today.value) : null;
  return step === null ? null : overdueLine(step, today.value, (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f));
});
</script>
