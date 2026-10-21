<template>
  <div class="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,0.8fr)] gap-2">
    <AppInput
      v-model.number.lazy="year"
      type="number"
      :tone="tone"
      :size="size"
      placeholder="Year"
      aria-label="Birth year"
    />
    <AppSelect
      :model-value="model.born_month ?? 0"
      :tone="tone"
      :size="size"
      :disabled="model.born_year === null"
      block
      aria-label="Birth month"
      @update:model-value="setMonth"
    >
      <option :value="0">Month unknown</option>
      <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
    </AppSelect>
    <AppInput
      v-if="model.born_month !== null"
      v-model.number.lazy="day"
      type="number"
      :tone="tone"
      :size="size"
      placeholder="Day"
      aria-label="Birth day"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * A birth date for an NPC or character (#1086): a year, then optionally a
 * month and a day in the campaign's own calendar. Each part is optional from
 * the right, so "born in 1448" and "born 12 Ches 1448" are both sayable. The
 * stored shape is the three nullable columns the rows carry; this never emits
 * `""` and never emits a month without a day.
 */
import { computed } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { FieldSize, FieldTone } from "@/components/common/controls/fieldVariants";
import { daysInMonth } from "@/lib/calendar/dayMath";
import { useCalendarStore } from "@/stores/calendar";

export interface BirthDateModel {
  born_year: number | null;
  born_month: number | null;
  born_day: number | null;
}

const model = defineModel<BirthDateModel>({ required: true });

const { tone = "default", size = "body" } = defineProps<{
  tone?: FieldTone;
  size?: FieldSize;
}>();

const adapter = computed(() => useCalendarStore().adapter);

function setYear(value: number | null | undefined) {
  // A cleared (or half-typed, NaN) year clears the whole date: a month with no
  // year is meaningless and the table refuses it.
  if (typeof value !== "number" || !Number.isFinite(value)) {
    model.value = { born_year: null, born_month: null, born_day: null };
    return;
  }
  model.value = { ...model.value, born_year: Math.trunc(value) };
}

function setMonth(value: number | null | undefined) {
  if (typeof value !== "number" || value < 1) {
    model.value = { ...model.value, born_month: null, born_day: null };
    return;
  }
  const year = model.value.born_year ?? adapter.value.defaultYear;
  const max = Math.max(1, daysInMonth(adapter.value, year, value));
  model.value = { ...model.value, born_month: value, born_day: Math.min(max, model.value.born_day ?? 1) };
}

// Through `v-model.number`, so AppInput hands over a number: without the
// modifier it emits the typed text, which setYear reads as no year at all.
const year = computed<number | null>({
  get: () => model.value.born_year,
  set: setYear,
});

const day = computed<number | null>({
  get: () => model.value.born_day,
  set: (value) => {
    const month = model.value.born_month;
    if (month === null) return;
    const year = model.value.born_year ?? adapter.value.defaultYear;
    const max = Math.max(1, daysInMonth(adapter.value, year, month));
    const wanted = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 1;
    model.value = { ...model.value, born_day: Math.min(max, Math.max(1, wanted)) };
  },
});
</script>
