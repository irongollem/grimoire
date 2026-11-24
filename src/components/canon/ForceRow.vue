<template>
  <CanonRow :id="`canon-entry-${entry.id}`" :label="entry.title" :selected="selected" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="block text-body font-semibold leading-snug text-foreground">{{ entry.title }}</span>
      <span v-if="outcome !== null" class="mt-0.5 block text-caption font-bold text-foreground" data-testid="force-outcome">
        {{ FORCE_OUTCOME_ENDED[outcome] }}<template v-if="entry.closed_note !== null"> · {{ entry.closed_note }}</template>
      </span>
      <span v-else class="mt-0.5 block text-caption text-muted-foreground" data-testid="force-next">
        <template v-if="next">Next: {{ next.title }}</template>
        <template v-else>No next step written</template>
      </span>
      <span v-if="late !== null" class="mt-0.5 block text-caption text-muted-foreground" data-testid="force-overdue">{{ late }}</span>
    </span>
    <template #mark>
      <ForceClock :force="entry" :ticks="ticks" small />
      <span class="text-label text-muted-foreground" data-testid="force-clock-tally">{{ entry.clock_size === null ? "No clock" : `${clockFilled(ticks, entry.clock_size)} of ${entry.clock_size}` }}</span>
      <CanonMoveButtons v-if="move" class="pointer-events-auto" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
    </template>
  </CanonRow>
</template>

<script setup lang="ts">
/**
 * One force in the list: its title, the next step it has not reached, a quiet line once the campaign's date has passed a
 * step's due date, and at the right edge its clock dial with "N of M". An ended force names how it ended instead of a next step.
 */
import { computed } from "vue";
import CanonRow from "./kit/CanonRow.vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import ForceClock from "./ForceClock.vue";
import { FORCE_OUTCOME_ENDED, forceOutcome } from "@/lib/canon/canonClose";
import { clockFilled, firstOverdueStep, overdueLine } from "@/lib/canon/canonForces";
import { useWorldToday } from "@/composables/canon/useWorldToday";
import { useCalendarStore } from "@/stores/calendar";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

const { entry, steps, ticks, selected = false, move = null } = defineProps<{
  entry: CanonEntry;
  steps: readonly CanonForceStep[];
  ticks: readonly CanonForceTick[];
  selected?: boolean;
  /** Up and down, offered only while nothing narrows the list; `null` hides them. */
  move?: { first: boolean; last: boolean } | null;
}>();
const emit = defineEmits<{ select: []; move: [direction: -1 | 1] }>();

const outcome = computed(() => forceOutcome(entry));
// The next step is the earliest one in the force's order that has not happened.
const next = computed(() => steps.filter((s) => s.reached_at === null).reduce<CanonForceStep | null>((first, s) => (first === null || s.sort_order < first.sort_order ? s : first), null));

const today = useWorldToday();
const calendar = useCalendarStore();
// An ended force moves no further, so what it never reached is not late.
const late = computed(() => {
  const step = outcome.value === null ? firstOverdueStep(steps, today.value) : null;
  return step === null ? null : overdueLine(step, today.value, (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f));
});
</script>
