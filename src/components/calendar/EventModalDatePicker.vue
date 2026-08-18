<template>
  <div>
    <label class="block text-label-lg font-semibold text-muted-foreground mb-2">
      DATE
    </label>
    <SegmentedControl v-model="dateTypeModel" :options="DATE_TYPE_OPTIONS" size="sm" block class="mb-3" />

    <!-- Regular date fields -->
    <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Year</label>
        <AppInput v-model.number="harptosYearModel" type="number" min="1" tone="muted" size="body-xs" align="right" />
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Month</label>
        <AppSelect v-model.number="harptosMonthModel" tone="muted" size="body-xs" block aria-label="Month">
          <option v-for="m in months" :key="m.num" :value="m.num">{{ m.name }}</option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Day</label>
        <AppInput v-model.number="harptosDayModel" type="number" min="1" max="30" tone="muted" size="body-xs" align="right" />
      </div>
    </div>

    <!-- Festival date fields -->
    <div v-else class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Year</label>
        <AppInput v-model.number="harptosYearModel" type="number" min="1" tone="muted" size="body-xs" align="right" />
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Festival</label>
        <AppSelect v-model="festivalDayModel" tone="muted" size="body-xs" block aria-label="Festival">
          <option v-for="f in availableFestivals" :key="f.name" :value="f.name">{{ f.name }}</option>
        </AppSelect>
      </div>
    </div>
  </div>

  <!-- Multi-day toggle -->
  <div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        :checked="isMultiDay"
        type="checkbox"
        class="w-4 h-4 rounded border-border accent-primary"
        @change="emit('update:isMultiDay', ($event.target as HTMLInputElement).checked)"
      />
      <span class="text-body text-foreground">Multi-day event</span>
    </label>

    <div v-if="isMultiDay" class="mt-3 grid grid-cols-3 gap-2">
      <div>
        <label class="block text-caption text-muted-foreground mb-1">End year</label>
        <AppInput v-model.number="endYearModel" type="number" min="1" tone="muted" size="body-xs" align="right" />
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">End month</label>
        <AppSelect v-model.number="endMonthModel" tone="muted" size="body-xs" block aria-label="End month">
          <option :value="null">—</option>
          <option v-for="m in months" :key="m.num" :value="m.num">{{ m.name }}</option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">End day</label>
        <AppInput v-model.number="endDayModel" type="number" min="1" max="30" tone="muted" size="body-xs" align="right" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

interface Month {
  num: number;
  name: string;
}

interface Festival {
  name: string;
}

const {
  dateType,
  harptosYear,
  harptosMonth,
  harptosDay,
  festivalDay,
  isMultiDay,
  endYear,
  endMonth,
  endDay,
  months,
  availableFestivals,
} = defineProps<{
  dateType: "regular" | "festival";
  harptosYear: number;
  harptosMonth: number | null;
  harptosDay: number | null;
  festivalDay: string | null;
  isMultiDay: boolean;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  months: Month[];
  availableFestivals: Festival[];
}>();

const emit = defineEmits<{
  "update:dateType": [value: "regular" | "festival"];
  "update:harptosYear": [value: number];
  "update:harptosMonth": [value: number];
  "update:harptosDay": [value: number];
  "update:festivalDay": [value: string];
  "update:isMultiDay": [value: boolean];
  "update:endYear": [value: number];
  "update:endMonth": [value: number | null];
  "update:endDay": [value: number];
}>();

const DATE_TYPE_OPTIONS = [
  { value: "regular", label: "Regular Day" },
  { value: "festival", label: "Festival Day" },
] as const satisfies ReadonlyArray<{ value: "regular" | "festival"; label: string }>;

// AppInput/AppSelect require v-model, but this component receives its value through
// props+emit rather than defineModel. Each field below is a local writable computed
// that reads the prop and re-emits on write — the same bridge CalendarEditor uses for
// SettingMonthDef.alias. harptosMonth/harptosDay/festivalDay/endYear/endDay are
// nullable in the prop (the parent nulls them when the other date-type is active) but
// these controls have no "clear" option in their own <option>/number-field range, so
// the null guard in their setters is defensive typing, not a live path. endMonth is
// the exception: its own "—" option means null is a real value both ways.
const dateTypeModel = computed({
  get: () => dateType,
  set: (v: "regular" | "festival") => emit("update:dateType", v),
});

const harptosYearModel = computed({
  get: () => harptosYear,
  set: (v: number) => emit("update:harptosYear", v),
});

const harptosMonthModel = computed({
  get: () => harptosMonth,
  set: (v: number | null) => { if (v !== null) emit("update:harptosMonth", v); },
});

const harptosDayModel = computed({
  get: () => harptosDay,
  set: (v: number | null) => { if (v !== null) emit("update:harptosDay", v); },
});

const festivalDayModel = computed({
  get: () => festivalDay,
  set: (v: string | null) => { if (v !== null) emit("update:festivalDay", v); },
});

const endYearModel = computed({
  get: () => endYear,
  set: (v: number | null) => { if (v !== null) emit("update:endYear", v); },
});

const endMonthModel = computed({
  get: () => endMonth,
  set: (v: number | null) => emit("update:endMonth", v),
});

const endDayModel = computed({
  get: () => endDay,
  set: (v: number | null) => { if (v !== null) emit("update:endDay", v); },
});
</script>
