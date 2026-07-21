<template>
  <div class="space-y-5 rounded-md border border-border bg-muted/30 p-4">
    <!-- Seed from preset -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-label-lg font-semibold text-muted-foreground">SEED FROM</span>
      <select
        :value="''"
        class="bg-muted border border-border rounded-md px-2 py-1.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="onSeed(($event.target as HTMLSelectElement).value)"
      >
        <option value="">(choose a preset to copy)</option>
        <option v-for="cal in availableCalendars" :key="cal.id" :value="cal.id">{{ cal.name }}</option>
      </select>
      <button
        type="button"
        class="px-2.5 py-1 text-label font-semibold border border-border rounded-md hover:bg-muted/60 transition-colors"
        @click="resetToDefault"
      >
        Reset
      </button>
    </div>

    <div class="gold-divider" />

    <!-- Name / epoch -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="sm:col-span-2">
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1">CALENDAR NAME</label>
        <input
          v-model="def.name"
          type="text"
          placeholder="My World Calendar"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1">EPOCH</label>
        <input
          v-model="def.epochName"
          type="text"
          maxlength="6"
          placeholder="AY"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>

    <!-- Default year & days per week -->
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1">DEFAULT YEAR</label>
        <input
          v-model.number="def.defaultYear"
          type="number"
          min="1"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1">DAYS PER WEEK</label>
        <input
          :value="daysPerWeek"
          type="number"
          min="1"
          max="30"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="setDaysPerWeek(($event.target as HTMLInputElement).valueAsNumber)"
        />
      </div>
    </div>

    <!-- Day labels -->
    <div>
      <label class="block text-label-lg font-semibold text-muted-foreground mb-1">DAY NAMES</label>
      <div class="flex flex-wrap gap-1.5">
        <input
          v-for="i in daysPerWeek"
          :key="i"
          :value="def.dayLabels?.[i - 1] ?? ''"
          type="text"
          maxlength="12"
          :placeholder="`Day ${i}`"
          class="w-20 bg-muted border border-border rounded-md px-2 py-1.5 text-caption text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
          @input="setDayLabel(i - 1, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- Leap year -->
    <div>
      <label class="flex items-start gap-3 cursor-pointer" @click="def.leapYearRule = def.leapYearRule === 'every4' ? 'none' : 'every4'">
        <div class="shrink-0 mt-0.5">
          <div
            class="h-5 w-9 rounded-full border-2 transition-colors relative"
            :class="def.leapYearRule === 'every4' ? 'bg-primary border-primary' : 'bg-muted border-border'"
          >
            <div
              class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
              :class="def.leapYearRule === 'every4' ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Has a leap day</span>
          <p class="text-caption text-muted-foreground mt-0.5">
            Every fourth year a festival day marked "Leap only" appears once more.
          </p>
        </div>
      </label>
    </div>

    <!-- Months -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-label-lg font-semibold text-muted-foreground">
          MONTHS ({{ def.months.length }} · {{ totalDays }} days/year)
        </label>
        <button
          type="button"
          class="px-2.5 py-1 text-label font-semibold border border-border rounded-md hover:bg-muted/60 transition-colors"
          @click="addMonth"
        >
          + Add month
        </button>
      </div>
      <div class="space-y-2">
        <div
          v-for="(m, i) in def.months"
          :key="i"
          class="grid grid-cols-12 gap-2 items-center rounded-md border border-border bg-muted/40 px-2 py-1.5"
        >
          <span class="col-span-1 text-center font-cinzel text-xs text-muted-foreground">{{ i + 1 }}</span>
          <input
            v-model="m.name"
            type="text"
            placeholder="Month name"
            class="col-span-5 bg-muted border border-border rounded-md px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            v-model="m.alias"
            type="text"
            placeholder="Alias (optional)"
            class="col-span-3 bg-muted border border-border rounded-md px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            v-model.number="m.days"
            type="number"
            min="1"
            max="60"
            class="col-span-2 bg-muted border border-border rounded-md px-2 py-1.5 text-body text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            class="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
            :aria-label="`Remove ${m.name || 'month ' + (i + 1)}`"
            @click="removeMonth(i)"
          >
            <IconDelete class="h-3.5 w-3.5" />
          </button>
        </div>
        <p v-if="def.months.length === 0" class="text-caption text-muted-foreground italic">
          No months yet. Add one to start.
        </p>
      </div>
    </div>

    <!-- Festival days -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-label-lg font-semibold text-muted-foreground">
          FESTIVAL DAYS ({{ def.intercalaryDays.length }})
        </label>
        <button
          type="button"
          class="px-2.5 py-1 text-label font-semibold border border-border rounded-md hover:bg-muted/60 transition-colors"
          :disabled="def.months.length === 0"
          @click="addIntercalary"
        >
          + Add festival day
        </button>
      </div>
      <p class="text-caption text-muted-foreground italic mb-2">
        Days inserted between months (e.g. Midwinter after month 1). Mark a day "leap only" to make it appear every fourth year.
      </p>
      <div class="space-y-2">
        <div
          v-for="(d, i) in def.intercalaryDays"
          :key="i"
          class="rounded-md border border-border bg-muted/40 px-2 py-2 space-y-2"
        >
          <div class="grid grid-cols-12 gap-2 items-center">
            <input
              v-model="d.name"
              type="text"
              placeholder="Festival name"
              class="col-span-5 bg-muted border border-border rounded-md px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div class="col-span-4 flex items-center gap-1.5">
              <span class="text-label text-muted-foreground">AFTER</span>
              <select
                v-model.number="d.afterMonth"
                class="flex-1 min-w-0 bg-muted border border-border rounded-md px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option v-for="(m, mi) in def.months" :key="mi" :value="mi + 1">{{ mi + 1 }}. {{ m.name }}</option>
              </select>
            </div>
            <label class="col-span-2 flex items-center gap-1.5 cursor-pointer">
              <input
                v-model="d.isLeapOnly"
                type="checkbox"
                class="w-3.5 h-3.5 rounded border-border accent-primary"
              />
              <span class="text-eyebrow text-muted-foreground">LEAP</span>
            </label>
            <button
              type="button"
              class="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              :aria-label="`Remove ${d.name || 'festival ' + (i + 1)}`"
              @click="removeIntercalary(i)"
            >
              <IconDelete class="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            v-model="d.description"
            type="text"
            placeholder="Short description"
            class="w-full bg-muted border border-border rounded-md px-2 py-1.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <p v-if="def.intercalaryDays.length === 0" class="text-caption text-muted-foreground italic">
          No festival days defined.
        </p>
      </div>
    </div>

    <!-- Validation hint -->
    <p v-if="validationMessage" class="text-caption text-destructive">{{ validationMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconDelete } from "@/lib/icons";
import {
  listCalendarAdapters,
  getCalendarAdapter,
  createDefaultCustomCalendarDef,
} from "@/calendars/index";
import type { SettingCalendarDef } from "@/settings/types";

const def = defineModel<SettingCalendarDef>({ required: true });

const availableCalendars = computed(() =>
  listCalendarAdapters().filter((c) => c.id !== "custom"),
);

const DEFAULT_NAMES_BY_LENGTH: Record<number, string[]> = {
  7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function defaultLabelsFor(n: number): string[] {
  return DEFAULT_NAMES_BY_LENGTH[n] ?? Array.from({ length: n }, (_, i) => `Day ${i + 1}`);
}

const daysPerWeek = computed(() => def.value.dayLabels?.length || 7);

function setDaysPerWeek(rawN: number) {
  const n = Math.max(1, Math.min(30, Math.round(rawN || 7)));
  const current = def.value.dayLabels ?? defaultLabelsFor(daysPerWeek.value);
  const next: string[] = [];
  for (let i = 0; i < n; i++) {
    next.push(current[i] ?? defaultLabelsFor(n)[i] ?? `Day ${i + 1}`);
  }
  def.value.dayLabels = next;
  // Custom editor always operates in weekly mode — tenday's special row-labelled
  // rendering is reserved for the built-in Faerûn preset.
  def.value.weekStyle = "weekly";
  def.value.weekRowNames = undefined;
}

function setDayLabel(i: number, v: string) {
  const cur = def.value.dayLabels ?? defaultLabelsFor(daysPerWeek.value);
  const next = [...cur];
  next[i] = v;
  def.value.dayLabels = next;
}

function onSeed(presetId: string) {
  if (!presetId) return;
  const adapter = getCalendarAdapter(presetId);
  // Custom calendars are always weekly with N day labels — collapse tenday
  // presets into the simpler weekly model.
  const labels = adapter.dayLabels
    ? [...adapter.dayLabels]
    : defaultLabelsFor(adapter.weekSize);
  const seeded: SettingCalendarDef = {
    name: adapter.name,
    epochName: adapter.epochName,
    defaultYear: adapter.defaultYear,
    weekStyle: "weekly",
    dayLabels: labels,
    weekRowNames: undefined,
    months: adapter.months.map((m) => ({ name: m.name, alias: m.alias, days: m.days })),
    intercalaryDays: adapter.intercalaryDays.map((d) => ({
      name: d.name,
      afterMonth: d.afterMonth,
      description: d.description,
      isLeapOnly: d.isLeapOnly,
    })),
    leapYearRule: adapter.isLeapYear(4) ? "every4" : "none",
  };
  def.value = seeded;
}

function resetToDefault() {
  def.value = createDefaultCustomCalendarDef();
}

function addMonth() {
  def.value.months.push({ name: `Month ${def.value.months.length + 1}`, days: 30 });
}

function removeMonth(i: number) {
  def.value.months.splice(i, 1);
  for (const d of def.value.intercalaryDays) {
    if (d.afterMonth > def.value.months.length) d.afterMonth = def.value.months.length;
  }
}

function addIntercalary() {
  def.value.intercalaryDays.push({
    name: "New Festival",
    afterMonth: Math.max(1, def.value.months.length),
    description: "",
  });
}

function removeIntercalary(i: number) {
  def.value.intercalaryDays.splice(i, 1);
}

const totalDays = computed(() => {
  const monthSum = def.value.months.reduce((sum, m) => sum + (Number(m.days) || 0), 0);
  const nonLeapInter = def.value.intercalaryDays.filter((d) => !d.isLeapOnly).length;
  return monthSum + nonLeapInter;
});

const validationMessage = computed(() => {
  if (!def.value.name.trim()) return "Calendar name is required.";
  if (!def.value.epochName.trim()) return "Epoch is required (e.g. \"AY\").";
  if (def.value.months.length === 0) return "At least one month is required.";
  if (def.value.months.some((m) => !m.name.trim())) return "Every month needs a name.";
  if (def.value.months.some((m) => !m.days || m.days < 1)) return "Every month needs at least 1 day.";
  return null;
});

defineExpose({ validationMessage });
</script>
