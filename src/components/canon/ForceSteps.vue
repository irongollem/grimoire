<template>
  <div class="flex flex-col gap-2">
    <span class="text-eyebrow text-muted-foreground">Next steps, in order</span>
    <ul v-if="steps.length > 0" class="flex flex-col gap-1.5" data-testid="force-steps">
      <ForceStepRow
        v-for="(step, index) in steps"
        :key="step.id"
        :step="step"
        :state="stepState(step, now)"
        :first="index === 0"
        :last="index === steps.length - 1"
        :frozen="frozen"
        :today="today"
        :calendar-path="calendarPathOf(step)"
        :putting-on-calendar="putting === step.id"
        @rename="(title) => update({ id: step.id, patch: { title } })"
        @reach="(reached) => reach({ step, reached })"
        @move="(direction) => move({ steps, id: step.id, direction })"
        @remove="remove(step.id)"
        @due="(date) => update({ id: step.id, patch: duePatch(date) })"
        @calendar="onCalendar(step)"
      />
    </ul>
    <p v-else class="text-caption text-muted-foreground">No steps yet. A step is what the force does next, so the table can see it coming.</p>
    <form v-if="!frozen" class="flex flex-wrap gap-2" @submit.prevent="addStep">
      <AppInput v-model="draft" tone="filled" size="body" class="min-w-0 flex-1" placeholder="A new step…" aria-label="A new step" />
      <AppButton type="submit" variant="outline" size="sm" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" label="Add step" :loading="isAdding" :disabled="draft.trim() === ''" />
    </form>
  </div>
</template>

<script setup lang="ts">
/** A force's steps (frame 06): add, edit, reorder, remove, and the Reached tick that stamps a step and writes a tick saying so. */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ForceStepRow from "./ForceStepRow.vue";
import {
  stepReached,
  stepState,
  useCreateForceSteps,
  useDeleteForceStep,
  useMoveForceStep,
  useReachForceStep,
  useUpdateForceStep,
} from "@/composables/canon/useCanonForces";
import { useStepCalendar } from "@/composables/canon/useStepCalendar";
import { useWorldToday } from "@/composables/canon/useWorldToday";
import { duePatch } from "@/lib/canon/canonForces";
import { IconAdd } from "@/lib/icons";
import type { CanonEntry, CanonForceStep } from "@/types/canon.types";

/** `frozen` is a force that has ended: its steps stay readable but cannot be reached, and none is added. */
const { force, steps, frozen = false } = defineProps<{ force: CanonEntry; steps: readonly CanonForceStep[]; frozen?: boolean }>();

const today = useWorldToday();
const now = computed(() => stepReached(steps));
const draft = ref("");
const { calendarPathOf, putOnCalendar } = useStepCalendar(() => force, () => steps);
// The step being put on the Calendar, so a second tap before the first lands makes no second event.
const putting = ref<string | null>(null);
async function onCalendar(step: CanonForceStep) {
  if (putting.value !== null) return;
  putting.value = step.id;
  try {
    await putOnCalendar(step);
  } finally {
    putting.value = null;
  }
}

const { mutateAsync: create, isPending: isAdding } = useCreateForceSteps();
const { mutate: update } = useUpdateForceStep();
const { mutate: remove } = useDeleteForceStep();
const { mutate: move } = useMoveForceStep();
const { mutate: reach } = useReachForceStep();

async function addStep() {
  const title = draft.value.trim();
  if (title === "") return;
  const next = steps.reduce((highest, s) => Math.max(highest, s.sort_order + 1), 0);
  try {
    await create([{ campaign_id: force.campaign_id, force_id: force.id, title, sort_order: next }]);
    draft.value = "";
  } catch {
    // The mutation has already told the DM (toast); the words stay in the box to try again.
  }
}
</script>
