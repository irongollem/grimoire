<template>
  <div class="flex flex-wrap items-center gap-1.5 text-caption">
    <template v-if="!editing">
      <AppButton
        v-if="due"
        variant="link"
        size="inline-caption"
        :label="`Due ${formatDueDate(adapter, due)}`"
        tooltip="Change the due date"
        @click="startEditing"
      />
      <AppButton v-else variant="link" size="inline-caption" label="Set due date" @click="startEditing" />
      <span v-if="summary?.urgency === 'overdue'" class="text-destructive">overdue</span>
      <AppButton
        v-if="due"
        variant="ghost"
        size="inline-xs"
        :icon="IconClose"
        aria-label="Clear due date"
        tooltip="Clear due date"
        @click="emit('change', null)"
      />
    </template>
    <template v-else>
      <AppInput v-model.number="year" type="number" min="1" tone="muted" size="body-xs" align="right" class="w-20" aria-label="Due year" />
      <AppSelect v-model.number="month" tone="muted" size="body-xs" aria-label="Due month">
        <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.alias || m.name }}</option>
      </AppSelect>
      <AppInput v-model.number="day" type="number" min="1" :max="maxDay" tone="muted" size="body-xs" align="right" class="w-16" aria-label="Due day" />
      <AppButton label="Set" size="xs" variant="primary" :disabled="!valid" @click="commit" />
      <AppButton label="Cancel" size="xs" variant="ghost" @click="editing = false" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * An objective's optional in-world due date (#1011): set, change, clear. The
 * server fails a still-pending objective of an active quest once the campaign
 * date passes it (inclusive), so this only edits the date. Months and their
 * names come from the campaign's calendar adapter.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { daysInMonth, type CalendarDate } from "@/lib/calendar/dayMath";
import { IconClose } from "@/lib/icons";
import { describeDeadline, formatDueDate } from "@/lib/quests/deadlines";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

const { due } = defineProps<{ due: CalendarDate | null }>();
const emit = defineEmits<{ change: [date: CalendarDate | null] }>();

const campaign = useCampaignStore();
const calendar = useCalendarStore();
const adapter = computed(() => calendar.adapter);
const today = computed<CalendarDate>(() => ({ year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay }));
const summary = computed(() => (due ? describeDeadline(adapter.value, due, today.value) : null));

const editing = ref(false);
const year = ref(0);
const month = ref(1);
const day = ref(1);

const maxDay = computed(() => daysInMonth(adapter.value, year.value, month.value));
const valid = computed(
  () => Number.isInteger(year.value) && Number.isInteger(day.value) && day.value >= 1 && day.value <= maxDay.value,
);

function startEditing() {
  const start = due ?? today.value;
  year.value = start.year;
  month.value = start.month;
  day.value = start.day;
  editing.value = true;
}

function commit() {
  if (!valid.value) return;
  emit("change", { year: year.value, month: month.value, day: day.value });
  editing.value = false;
}
</script>
