<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="text-label-lg font-semibold text-muted-foreground">
        MOONS ({{ moons.length }})
      </label>
      <AppButton
        variant="outline"
        size="xs"
        label="+ Add moon"
        :disabled="months.length === 0"
        @click="addMoon"
      />
    </div>
    <p class="text-caption text-muted-foreground italic mb-2">
      Each moon is anchored on one day it is full; every other phase is counted from there.
    </p>
    <div class="space-y-2">
      <div
        v-for="(m, i) in moons"
        :key="i"
        class="rounded-md border border-border bg-muted/40 px-2 py-2 space-y-2"
      >
        <div class="grid grid-cols-12 gap-2 items-center">
          <MoonPhaseIcon :age="0.5" :color="m.color" class="col-span-1 h-5 w-5 justify-self-center" />
          <AppInput v-model="m.name" tone="card" size="body" placeholder="Moon name" class="col-span-6" />
          <div class="col-span-4 flex items-center gap-1.5">
            <AppInput
              v-model.number="m.cycleDays"
              tone="card"
              size="body"
              type="number"
              min="0.01"
              step="0.01"
              align="center"
              aria-label="Cycle length in days"
            />
            <span class="text-label text-muted-foreground">DAYS</span>
          </div>
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconDelete"
            :aria-label="`Remove ${m.name || 'moon ' + (i + 1)}`"
            class="col-span-1"
            @click="removeMoon(i)"
          />
        </div>
        <div class="grid grid-cols-12 gap-2 items-center">
          <span class="col-span-3 text-label text-muted-foreground">FULL ON</span>
          <AppInput
            v-if="!('festival' in m.fullOn)"
            v-model.number="m.fullOn.day"
            tone="card"
            size="body"
            type="number"
            min="1"
            align="center"
            class="col-span-2"
            aria-label="Full moon day"
          />
          <AppSelect
            v-model="anchorModels[i]!.value"
            size="body"
            block
            :class="'festival' in m.fullOn ? 'col-span-6 min-w-0' : 'col-span-4 min-w-0'"
            aria-label="Full moon month or festival"
          >
            <option v-for="(mo, mi) in months" :key="mi" :value="`m:${mi + 1}`">{{ mi + 1 }}. {{ mo.name }}</option>
            <option v-for="f in intercalaryDays" :key="f.name" :value="`f:${f.name}`">✦ {{ f.name }}</option>
          </AppSelect>
          <AppInput
            v-model.number="m.fullOn.year"
            tone="card"
            size="body"
            type="number"
            align="center"
            class="col-span-3"
            aria-label="Full moon year"
          />
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-label text-muted-foreground mr-1">COLOUR</span>
          <AppButton
            variant="ghost"
            size="icon-xs"
            :active="!m.color"
            aria-label="Default colour"
            @click="m.color = undefined"
          >
            <MoonPhaseIcon :age="0.5" class="h-3.5 w-3.5" />
          </AppButton>
          <AppButton
            v-for="sw in MOON_SWATCHES"
            :key="sw.value"
            variant="ghost"
            size="icon-xs"
            :active="m.color === sw.value"
            :aria-label="sw.label"
            @click="m.color = sw.value"
          >
            <MoonPhaseIcon :age="0.5" :color="sw.value" class="h-3.5 w-3.5" />
          </AppButton>
        </div>
      </div>
      <p v-if="moons.length === 0" class="text-caption text-muted-foreground italic">
        No moons. The night sky is empty.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import MoonPhaseIcon from "@/components/calendar/MoonPhaseIcon.vue";
import { computed } from "vue";
import type { CalendarMoon } from "@/types/calendar.types";
import type { SettingIntercalaryDef, SettingMonthDef } from "@/settings/types";

/** A short palette of moon tones; the first choice (no colour) is the neutral default. */
const MOON_SWATCHES = [
  { label: "Silver", value: "#cfd6e4" },
  { label: "Pale gold", value: "#e6cf8b" },
  { label: "Amber", value: "#e0a458" },
  { label: "Rust", value: "#c8745a" },
  { label: "Sea green", value: "#7cc4a8" },
  { label: "Blue", value: "#7fa6e0" },
  { label: "Violet", value: "#a98ee0" },
] as const;

const moons = defineModel<CalendarMoon[]>({ required: true });
const { months, intercalaryDays, defaultYear } = defineProps<{
  months: SettingMonthDef[];
  intercalaryDays: SettingIntercalaryDef[];
  defaultYear: number;
}>();

/**
 * One writable computed per row: the select carries "m:<month>" or "f:<festival>".
 * Choosing a festival drops the day; choosing a month keeps the day (default 1).
 */
const anchorModels = computed(() =>
  moons.value.map((m) =>
    computed<string>({
      get: () => ("festival" in m.fullOn ? `f:${m.fullOn.festival}` : `m:${m.fullOn.month}`),
      set: (v) => {
        const year = m.fullOn.year;
        if (v.startsWith("f:")) {
          m.fullOn = { year, festival: v.slice(2) };
        } else {
          const day = "day" in m.fullOn ? m.fullOn.day : 1;
          m.fullOn = { year, month: Number(v.slice(2)), day };
        }
      },
    }),
  ),
);

/** "Moon", then "Moon 2", "Moon 3": a fresh name, so two new moons are never mistaken for one. */
function nextMoonName(): string {
  const taken = new Set(moons.value.map((m) => m.name.trim()));
  if (!taken.has("Moon")) return "Moon";
  let n = 2;
  while (taken.has(`Moon ${n}`)) n++;
  return `Moon ${n}`;
}

function addMoon() {
  moons.value = [
    ...moons.value,
    { name: nextMoonName(), cycleDays: 28, fullOn: { year: defaultYear, month: 1, day: 1 } },
  ];
}

function removeMoon(i: number) {
  moons.value = moons.value.filter((_, idx) => idx !== i);
}
</script>
