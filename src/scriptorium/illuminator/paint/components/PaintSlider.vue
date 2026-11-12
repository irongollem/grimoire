<template>
  <label class="flex min-w-0 gap-2" :class="layout === 'stacked' ? 'flex-col items-stretch gap-1' : 'items-center'" :data-layout="layout">
    <template v-if="layout === 'row'">
      <span class="w-24 shrink-0 text-caption text-muted-foreground">{{ label }}</span>
      <input
        type="range"
        class="min-w-0 flex-1 cursor-pointer accent-primary disabled:opacity-40"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label"
        @input="emit('update:modelValue', parseFloat(($event.target as HTMLInputElement).value))"
        @change="emit('commit')"
      />
      <span class="w-12 shrink-0 text-right text-caption-sm tabular-nums text-muted-foreground">{{ shown }}</span>
    </template>
    <template v-else>
      <span class="flex items-baseline justify-between gap-2" :class="layout === 'stacked' ? '' : 'shrink-0'">
        <span class="text-eyebrow text-muted-foreground">{{ label }}</span>
        <span class="text-right text-caption tabular-nums text-foreground" :class="layout === 'stacked' ? '' : 'w-[3.25rem]'">{{ shown }}</span>
      </span>
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label"
        class="h-1.5 min-w-[5rem] flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary disabled:opacity-40"
        @input="emit('update:modelValue', parseFloat(($event.target as HTMLInputElement).value))"
        @change="emit('commit')"
      />
    </template>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * A labelled range with its value shown. One component for the options bar (`bar`), the layers panel (`stacked`)
 * and the brush settings (`row`). `display` overrides the shown value; otherwise a 0 to 1 value reads as a
 * percentage (`percent`), or as the number with its `unit`. `commit` fires when the thumb is released, for a
 * caller that wants one history entry per drag rather than one per input.
 */
const {
  label,
  modelValue,
  display,
  min = 0,
  max = 1,
  step = 0.01,
  layout = "bar",
  percent = true,
  unit = "",
  disabled = false,
} = defineProps<{
  label: string;
  modelValue: number;
  display?: string;
  min?: number;
  max?: number;
  step?: number;
  layout?: "bar" | "stacked" | "row";
  percent?: boolean;
  unit?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ (e: "update:modelValue", value: number): void; (e: "commit"): void }>();

const shown = computed(() => display ?? (percent ? `${Math.round(modelValue * 100)}%` : `${Math.round(modelValue * 100) / 100}${unit}`));
</script>
