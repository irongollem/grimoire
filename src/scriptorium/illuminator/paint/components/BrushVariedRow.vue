<template>
  <div class="flex flex-col gap-1.5">
    <PaintSlider layout="row" :label="`${label} jitter`" :model-value="modelValue.jitter" @update:model-value="emit('update:modelValue', { ...modelValue, jitter: $event })" />
    <div class="flex items-center gap-3">
      <span class="w-24 shrink-0 text-caption text-muted-foreground">{{ label }} control</span>
      <AppSelect
        :model-value="modelValue.control"
        size="xs"
        :aria-label="`${label} control`"
        class="min-w-0 flex-1"
        @update:model-value="emit('update:modelValue', { ...modelValue, control: $event })"
      >
        <option v-for="o in CONTROL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </AppSelect>
    </div>
    <!-- The minimum is the floor a control brings the value down to, so it means nothing while the control is off. -->
    <PaintSlider
      layout="row"
      v-if="showMinimum && modelValue.control !== 'off'"
      :label="`${label} minimum`"
      :model-value="modelValue.minimum"
      @update:model-value="emit('update:modelValue', { ...modelValue, minimum: $event })"
    />
  </div>
</template>

<script setup lang="ts">
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { Varied } from "../engine/types";
import PaintSlider from "./PaintSlider.vue";
import { CONTROL_OPTIONS } from "./brushSettings";

/** The jitter, control and minimum of one varied value. Emits the whole updated `Varied`. */
const { label, modelValue, showMinimum = true } = defineProps<{ label: string; modelValue: Varied; showMinimum?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: Varied] }>();
</script>
