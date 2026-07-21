<template>
  <div>
    <div
      class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
      @click="emit('toggle')"
    >
      <IconChevronRight
        class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
        :class="open ? 'rotate-90' : ''"
      />
      <span
        class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
        :class="enabled ? 'text-foreground' : 'text-muted-foreground'"
      >Colour Grading</span>
      <button
        type="button"
        class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        :class="enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
        @click.stop="emit('update:enabled', !enabled)"
      >
        <span
          class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
          :class="enabled ? 'translate-x-4.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div
      v-show="open"
      class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
      :class="enabled ? 'opacity-100' : 'opacity-35'"
    >
      <!-- Preset buttons -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-eyebrow text-muted-foreground mr-1">Presets</span>
        <button
          v-for="preset in GRADING_PRESETS"
          :key="preset.label"
          type="button"
          class="text-label px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
          @click="emit('apply-preset', preset.values)"
        >{{ preset.label }}</button>
        <button
          type="button"
          class="text-label text-muted-foreground hover:text-foreground transition-colors ml-auto"
          @click="emit('reset')"
        >Reset</button>
      </div>

      <!-- Grading sliders -->
      <div v-for="gs in GRADING_SLIDERS" :key="gs.key">
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">
            {{ gs.label }}
          </label>
          <span class="text-caption text-muted-foreground tabular-nums">
            {{ gradingDisplay(gs.key) }}
          </span>
        </div>
        <input
          type="range"
          :min="gs.min"
          :max="gs.max"
          :step="gs.step"
          :value="grading[gs.key]"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-slider', gs.key, parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronRight } from "@/lib/icons";
import { GRADING_PRESETS, type ColourGradingOptions } from "@/lib/colourGrading";

const {
  grading,
  enabled,
  open,
} = defineProps<{
  grading: ColourGradingOptions;
  enabled: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "update:enabled": [value: boolean];
  "set-slider": [key: GradingSliderKey, value: number];
  "apply-preset": [values: ColourGradingOptions];
  reset: [];
}>();

type GradingSliderKey = keyof ColourGradingOptions;

const GRADING_SLIDERS: Array<{
  key: GradingSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  isHue: boolean;
}> = [
  { key: "brightness",  label: "Brightness", min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "contrast",    label: "Contrast",   min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "saturation",  label: "Saturation", min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "temperature", label: "Temp",       min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "hue",         label: "Hue",        min: -180, max: 180, step: 1,    isHue: true  },
];

function gradingDisplay(key: GradingSliderKey): string {
  const v = grading[key];
  if (key === "hue") {
    const deg = Math.round(v);
    return deg >= 0 ? `+${deg}°` : `${deg}°`;
  }
  const pct = Math.round(v * 100);
  return pct >= 0 ? `+${pct}` : String(pct);
}
</script>
