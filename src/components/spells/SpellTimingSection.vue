<template>
  <!-- Casting Time + Range -->
  <div class="grid grid-cols-2 gap-3">
    <div class="flex flex-col gap-1">
      <span class="text-label-lg text-muted-foreground uppercase"
        >Casting Time</span
      >
      <AppSelect v-model="castingTimeModel" tone="card" size="lg" weight="normal" block>
        <option v-for="o in CASTING_TIME_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </AppSelect>
      <AppInput
        v-if="castingTime === 'Special'"
        v-model="castingTimeCustomModel"
        placeholder="Describe casting time…"
        tone="muted"
        size="body"
        class="mt-1"
      />
      <AppInput
        v-if="castingTime === 'Reaction'"
        v-model="castingTimeCustomModel"
        placeholder="Reaction to what? (optional)"
        tone="muted"
        size="body"
        class="mt-1"
      />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-label-lg text-muted-foreground uppercase"
        >Range</span
      >
      <AppSelect v-model="rangeModel" tone="card" size="lg" weight="normal" block>
        <option v-for="o in RANGE_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </AppSelect>
      <AppInput
        v-if="range === 'Special'"
        v-model="rangeCustomModel"
        placeholder="Describe range…"
        tone="muted"
        size="body"
        class="mt-1"
      />
    </div>
  </div>

  <!-- Duration + flags -->
  <div class="grid grid-cols-2 gap-3">
    <div class="flex flex-col gap-1">
      <span class="text-label-lg text-muted-foreground uppercase"
        >Duration</span
      >
      <AppSelect v-model="durationModel" tone="card" size="lg" weight="normal" block>
        <option v-for="o in DURATION_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </AppSelect>
      <AppInput
        v-if="duration === 'Special'"
        v-model="durationCustomModel"
        placeholder="Describe duration…"
        tone="muted"
        size="body"
        class="mt-1"
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
        <span class="text-label-lg font-semibold text-muted-foreground"
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
        <span class="text-label-lg font-semibold text-muted-foreground"
          >RITUAL</span
        >
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
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

// AppInput/AppSelect require v-model, but this component receives its value through
// props+emit rather than defineModel. Each field below is a local writable computed
// that reads the prop and re-emits on write — the same bridge EventModalDatePicker
// uses. durationModel's setter keeps the original onDurationChange side effect: picking
// a "Concentration, ..." duration also turns the Concentration checkbox on.
const castingTimeModel = computed({
  get: () => castingTime,
  set: (v: string) => emit("update:castingTime", v),
});
const castingTimeCustomModel = computed({
  get: () => castingTimeCustom,
  set: (v: string) => emit("update:castingTimeCustom", v),
});
const rangeModel = computed({
  get: () => range,
  set: (v: string) => emit("update:range", v),
});
const rangeCustomModel = computed({
  get: () => rangeCustom,
  set: (v: string) => emit("update:rangeCustom", v),
});
const durationModel = computed({
  get: () => duration,
  set: (v: string) => {
    emit("update:duration", v);
    if (v.startsWith("Concentration")) emit("update:concentration", true);
  },
});
const durationCustomModel = computed({
  get: () => durationCustom,
  set: (v: string) => emit("update:durationCustom", v),
});
</script>
