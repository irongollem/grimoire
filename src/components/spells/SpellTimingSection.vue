<template>
  <!-- Casting Time + Range -->
  <div class="grid grid-cols-2 gap-3">
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-[0.6875rem] text-muted-foreground tracking-wider uppercase"
        >Casting Time</span
      >
      <select
        :value="castingTime"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="$emit('update:castingTime', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in CASTING_TIME_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </select>
      <input
        v-if="castingTime === 'Special'"
        :value="castingTimeCustom"
        placeholder="Describe casting time…"
        class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:castingTimeCustom', ($event.target as HTMLInputElement).value)"
      />
      <input
        v-if="castingTime === 'Reaction'"
        :value="castingTimeCustom"
        placeholder="Reaction to what? (optional)"
        class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:castingTimeCustom', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-[0.6875rem] text-muted-foreground tracking-wider uppercase"
        >Range</span
      >
      <select
        :value="range"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="$emit('update:range', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in RANGE_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </select>
      <input
        v-if="range === 'Special'"
        :value="rangeCustom"
        placeholder="Describe range…"
        class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:rangeCustom', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>

  <!-- Duration + flags -->
  <div class="grid grid-cols-2 gap-3">
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-[0.6875rem] text-muted-foreground tracking-wider uppercase"
        >Duration</span
      >
      <select
        :value="duration"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="onDurationChange(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in DURATION_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </select>
      <input
        v-if="duration === 'Special'"
        :value="durationCustom"
        placeholder="Describe duration…"
        class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:durationCustom', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="flex flex-col gap-3 justify-end pb-1">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          :checked="concentration"
          class="rounded"
          @change="$emit('update:concentration', ($event.target as HTMLInputElement).checked)"
        />
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >CONCENTRATION</span
        >
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          :checked="ritual"
          class="rounded"
          @change="$emit('update:ritual', ($event.target as HTMLInputElement).checked)"
        />
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >RITUAL</span
        >
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CASTING_TIME_OPTIONS, DURATION_OPTIONS, RANGE_OPTIONS } from "@/types/spell.types";

const {
  castingTime,
  castingTimeCustom,
  range,
  rangeCustom,
  duration,
  durationCustom,
  concentration,
  ritual,
} = defineProps<{
  castingTime: string;
  castingTimeCustom: string;
  range: string;
  rangeCustom: string;
  duration: string;
  durationCustom: string;
  concentration: boolean;
  ritual: boolean;
}>();

const emit = defineEmits<{
  "update:castingTime": [value: string];
  "update:castingTimeCustom": [value: string];
  "update:range": [value: string];
  "update:rangeCustom": [value: string];
  "update:duration": [value: string];
  "update:durationCustom": [value: string];
  "update:concentration": [value: boolean];
  "update:ritual": [value: boolean];
}>();

function onDurationChange(value: string) {
  emit("update:duration", value);
  if (value.startsWith("Concentration")) emit("update:concentration", true);
}
</script>
