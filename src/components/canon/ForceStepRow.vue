<template>
  <li class="flex min-w-0 flex-col gap-1.5 border border-border bg-muted/40 px-3 py-2" :data-reached="reached" data-testid="force-step">
    <AppInput :key="revision" v-model.lazy="text" wrap size="body" tone="filled" aria-label="The step" placeholder="What the force does next…" />
    <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-label" :class="state === 'now' ? 'font-bold text-primary' : 'text-muted-foreground'" data-testid="force-step-state">{{ STATE_LABEL[state] }}</span>
      <span v-if="late !== null" class="text-caption text-muted-foreground" data-testid="force-step-overdue">{{ late }}</span>
      <span class="ml-auto flex shrink-0 items-center gap-1">
        <AppCheckbox :model-value="reached" label="Reached" label-role="label" :disabled="frozen" @update:model-value="(v: boolean) => emit('reach', v)" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" aria-label="Move this step earlier" :disabled="first" @click="emit('move', -1)" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" aria-label="Move this step later" :disabled="last" @click="emit('move', 1)" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Remove this step" @click="emit('remove')" />
      </span>
    </span>
    <span class="flex flex-wrap items-end gap-2" data-testid="force-step-due">
      <AppButton
        variant="ghost"
        size="xs"
        :label="dueText === null ? 'Set a due date' : `Due ${dueText}`"
        :aria-expanded="editingDue"
        data-testid="force-step-due-toggle"
        @click="editingDue = !editingDue"
      />
      <template v-if="editingDue">
        <WorldDateField :date="due" @change="(date) => emit('due', date)" />
        <AppButton v-if="due.year !== null" variant="outline" size="xs" label="Clear the date" data-testid="force-step-due-clear" @click="emit('due', { year: null, month: null, day: null })" />
      </template>
    </span>
  </li>
</template>

<script setup lang="ts">
/**
 * One step of a force: its line (saved when the field is left), the Reached tick, the reorder and remove buttons and
 * the date it is due in the world (#1258 item 9), which says so quietly once the campaign's date has passed it.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import WorldDateField from "./WorldDateField.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import type { StepState } from "@/composables/canon/useCanonForces";
import { overdueLine, stepDue } from "@/lib/canon/canonForces";
import { worldDateLabel, type WorldDate } from "@/lib/canon/canonLore";
import { useCalendarStore } from "@/stores/calendar";
import { IconChevronDown, IconChevronUp, IconClose } from "@/lib/icons";
import type { CanonForceStep } from "@/types/canon.types";

const STATE_LABEL: Record<StepState, string> = { done: "Done", now: "Now", next: "Next" };

const { step, state, first, last, frozen = false, today = null } = defineProps<{
  step: CanonForceStep;
  state: StepState;
  first: boolean;
  last: boolean;
  frozen?: boolean;
  /** The campaign's date in the world, or null when it keeps no calendar. */
  today?: WorldDate | null;
}>();
const emit = defineEmits<{ rename: [title: string]; reach: [reached: boolean]; move: [direction: -1 | 1]; remove: []; due: [date: WorldDate] }>();

const calendar = useCalendarStore();
const format = (y: number, m: number | null, d: number | null, f: string | null) => calendar.adapter.formatDate(y, m, d, f);
const due = computed(() => stepDue(step));
const dueText = computed(() => worldDateLabel(due.value, format));
const late = computed(() => (frozen ? null : overdueLine(step, today, format)));
const editingDue = ref(false);

const reached = computed(() => step.reached_at !== null);
const { text, revision } = useCommittedText(() => step.title, (next) => emit("rename", next));
</script>
