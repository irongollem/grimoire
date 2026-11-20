<template>
  <div class="flex flex-wrap items-end gap-2" data-testid="world-date">
    <label class="flex w-28 flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Year{{ adapter.epochName ? ` (${adapter.epochName})` : "" }}</span>
      <AppInput :model-value="date.year" type="number" tone="filled" size="body" aria-label="Year" placeholder="Year" @change="onYear" />
    </label>
    <label class="flex min-w-32 flex-1 flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Month</span>
      <AppSelect :model-value="date.month" tone="filled" weight="normal" size="body" block aria-label="Month" :disabled="date.year === null" @change="onMonth">
        <option v-if="optional" :value="null">No month</option>
        <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
      </AppSelect>
    </label>
    <label class="flex w-24 flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Day</span>
      <AppInput :model-value="date.day" type="number" tone="filled" size="body" aria-label="Day" placeholder="Day" :disabled="date.month === null" @change="onDay" />
    </label>
  </div>
</template>

<script setup lang="ts">
/**
 * A date in the world, entered through the campaign's calendar: a year, then optionally a month and a day (a month
 * needs a year and a day needs a month, as the table says). Used for a lore entry's date (optional) and for the
 * campaign's today (never cleared). Emits the whole date after every committed change, already normalised.
 */
import { computed } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCalendarStore } from "@/stores/calendar";
import { normaliseDate, type WorldDate } from "@/lib/canon/canonLore";

const { date, optional = true } = defineProps<{ date: WorldDate; optional?: boolean }>();
const emit = defineEmits<{ change: [date: WorldDate] }>();

const adapter = computed(() => useCalendarStore().adapter);

function whole(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function onYear(event: Event) {
  const year = whole(event);
  // A campaign's today always has a year: an emptied field puts the saved one back rather than clearing it.
  if (year === null && !optional) return void ((event.target as HTMLInputElement).value = String(date.year ?? ""));
  emit("change", normaliseDate({ ...date, year }));
}

function onMonth(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  const month = raw === "" || Number.isNaN(Number(raw)) ? null : Number(raw);
  emit("change", normaliseDate({ ...date, month, day: month === null ? null : date.day }));
}

function onDay(event: Event) {
  const day = whole(event);
  const length = date.year !== null && date.month !== null ? (adapter.value.daysInMonth?.(date.year, date.month) ?? adapter.value.months.find((m) => m.num === date.month)?.days ?? null) : null;
  // A day outside the month is refused here, not saved: the calendar has no such day.
  if (day !== null && (day < 1 || (length !== null && day > length))) return void ((event.target as HTMLInputElement).value = String(date.day ?? ""));
  emit("change", { ...date, day });
}
</script>
