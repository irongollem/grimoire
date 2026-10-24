<template>
  <div class="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,0.8fr)] gap-2">
    <AppInput
      v-model.number.lazy="year"
      type="number"
      :tone="tone"
      :size="size"
      placeholder="Year"
      :aria-label="`${label} year`"
    />
    <AppSelect
      :model-value="model.month ?? 0"
      :tone="tone"
      :size="size"
      :disabled="model.year === null"
      block
      :aria-label="`${label} month`"
      @update:model-value="setMonth"
    >
      <option :value="0">Month unknown</option>
      <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
    </AppSelect>
    <AppInput
      v-if="model.month !== null"
      v-model.number.lazy="day"
      type="number"
      :tone="tone"
      :size="size"
      placeholder="Day"
      :aria-label="`${label} day`"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * A date for an NPC or character (#1086 birth, death): a year, then optionally
 * a month and a day in the campaign's own calendar. Each part is optional from
 * the right, so "1448" and "12 Ches 1448" are both sayable. `label` ("Birth",
 * "Death") names the three controls for assistive tech; the caller maps
 * `{ year, month, day }` onto its own born_* / died_* columns. This never emits
 * `""` and never emits a month without a day.
 */
import { computed } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { FieldSize, FieldTone } from "@/components/common/controls/fieldVariants";
import { daysInMonth } from "@/lib/calendar/dayMath";
import { useCalendarStore } from "@/stores/calendar";

export interface CalendarDateModel {
  year: number | null;
  month: number | null;
  day: number | null;
}

const model = defineModel<CalendarDateModel>({ required: true });

const { tone = "default", size = "body", label } = defineProps<{
  label: string;
  tone?: FieldTone;
  size?: FieldSize;
}>();

const adapter = computed(() => useCalendarStore().adapter);

function setYear(value: number | null | undefined) {
  // A cleared (or half-typed, NaN) year clears the whole date: a month with no
  // year is meaningless and the table refuses it.
  if (typeof value !== "number" || !Number.isFinite(value)) {
    model.value = { year: null, month: null, day: null };
    return;
  }
  model.value = { ...model.value, year: Math.trunc(value) };
}

function setMonth(value: number | null | undefined) {
  if (typeof value !== "number" || value < 1) {
    model.value = { ...model.value, month: null, day: null };
    return;
  }
  const year = model.value.year ?? adapter.value.defaultYear;
  const max = Math.max(1, daysInMonth(adapter.value, year, value));
  model.value = { ...model.value, month: value, day: Math.min(max, model.value.day ?? 1) };
}

// Through `v-model.number`, so AppInput hands over a number: without the
// modifier it emits the typed text, which setYear reads as no year at all.
const year = computed<number | null>({
  get: () => model.value.year,
  set: setYear,
});

const day = computed<number | null>({
  get: () => model.value.day,
  set: (value) => {
    const month = model.value.month;
    if (month === null) return;
    const year = model.value.year ?? adapter.value.defaultYear;
    const max = Math.max(1, daysInMonth(adapter.value, year, month));
    const wanted = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 1;
    model.value = { ...model.value, day: Math.min(max, Math.max(1, wanted)) };
  },
});
</script>
