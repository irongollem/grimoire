<template>
  <div>
    <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">
      DATE
    </label>
    <div class="flex rounded-md border border-border overflow-hidden mb-3">
      <button
        type="button"
        class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="dateType === 'regular' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
        @click="emit('update:dateType', 'regular')"
      >
        Regular Day
      </button>
      <button
        type="button"
        class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="dateType === 'festival' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
        @click="emit('update:dateType', 'festival')"
      >
        Festival Day
      </button>
    </div>

    <!-- Regular date fields -->
    <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
        <input
          :value="harptosYear"
          type="number"
          min="1"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:harptosYear', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">Month</label>
        <select
          :value="harptosMonth"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="emit('update:harptosMonth', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="m in months" :key="m.num" :value="m.num">{{ m.name }}</option>
        </select>
      </div>
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">Day</label>
        <input
          :value="harptosDay"
          type="number"
          min="1"
          max="30"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:harptosDay', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <!-- Festival date fields -->
    <div v-else class="grid grid-cols-2 gap-2">
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
        <input
          :value="harptosYear"
          type="number"
          min="1"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:harptosYear', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">Festival</label>
        <select
          :value="festivalDay"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="emit('update:festivalDay', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in availableFestivals" :key="f.name" :value="f.name">{{ f.name }}</option>
        </select>
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
      <span class="font-fell text-sm text-foreground">Multi-day event</span>
    </label>

    <div v-if="isMultiDay" class="mt-3 grid grid-cols-3 gap-2">
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">End year</label>
        <input
          :value="endYear"
          type="number"
          min="1"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:endYear', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">End month</label>
        <select
          :value="endMonth"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="emit('update:endMonth', ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="null">—</option>
          <option v-for="m in months" :key="m.num" :value="m.num">{{ m.name }}</option>
        </select>
      </div>
      <div>
        <label class="block font-fell text-xs text-muted-foreground mb-1">End day</label>
        <input
          :value="endDay"
          type="number"
          min="1"
          max="30"
          class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:endDay', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
</script>
