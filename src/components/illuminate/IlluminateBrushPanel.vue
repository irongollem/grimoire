<template>
  <div class="border-b border-border">
    <div
      class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
      @click="emit('toggle')"
    >
      <IconChevronRight
        class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase text-foreground">Brush</span>
      <span v-if="hasStrokes" class="text-label text-primary mr-2">strokes</span>
    </div>

    <div v-show="open" class="px-4 pb-4 flex flex-col gap-3">
      <!-- Brush type selector -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-eyebrow text-muted-foreground mr-1">Shape</span>
        <AppButton
          v-for="bt in (['round', 'splatter', 'rough', 'chalk'] as BrushType[])"
          :key="bt"
          variant="subtle"
          size="xs"
          class="capitalize"
          :active="brush.brushType === bt"
          :label="bt"
          @click="emit('update:brush', { ...brush, brushType: bt })"
        />
      </div>

      <!-- Pressure target toggle -->
      <div class="flex items-center gap-1.5">
        <span class="text-eyebrow text-muted-foreground mr-1">Pressure →</span>
        <AppButton
          v-for="pt in (['size', 'opacity'] as PressureTarget[])"
          :key="pt"
          variant="subtle"
          size="xs"
          :active="brush.pressureTarget === pt"
          :label="pt"
          @click="emit('update:brush', { ...brush, pressureTarget: pt })"
        />
      </div>

      <!-- Brush sliders (hardness hidden for non-round shapes) -->
      <div v-for="bs in activeBrushSliders" :key="bs.key">
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">{{ bs.label }}</label>
          <span class="text-caption text-muted-foreground tabular-nums">{{ brushDisplay(bs.key) }}</span>
        </div>
        <input
          type="range"
          :min="bs.min"
          :max="bs.max"
          :step="bs.step"
          :value="brush[bs.key]"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('update:brush', { ...brush, [bs.key]: parseFloat((e.target as HTMLInputElement).value) })"
        />
      </div>

      <!-- Undo + Clear -->
      <div class="flex items-center gap-2 pt-1">
        <AppButton
          variant="subtle"
          size="xs"
          label="Undo (Ctrl+Z)"
          @click="emit('undo')"
        />
        <AppButton
          variant="subtle"
          size="xs"
          tone="danger"
          :disabled="!hasStrokes"
          label="Clear mask"
          @click="emit('clear')"
        />
      </div>
      <p class="text-caption text-muted-foreground italic">
        Left-drag erases · Right-drag restores · Ctrl+Z undo
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconChevronRight } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import type { BrushState, BrushType, PressureTarget } from "@/lib/illuminate/brushMask";

const {
  brush,
  open,
  hasStrokes,
} = defineProps<{
  brush: BrushState;
  open: boolean;
  hasStrokes: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "update:brush": [value: BrushState];
  undo: [];
  clear: [];
}>();

type BrushSliderKey = "size" | "hardness" | "opacity" | "jitter" | "spacing";

const BRUSH_SLIDERS: Array<{ key: BrushSliderKey; label: string; min: number; max: number; step: number }> = [
  { key: "size",     label: "Size",     min: 4,    max: 120,  step: 1    },
  { key: "hardness", label: "Hardness", min: 0,    max: 1,    step: 0.01 },
  { key: "opacity",  label: "Opacity",  min: 0.01, max: 1,    step: 0.01 },
  { key: "jitter",   label: "Jitter",   min: 0,    max: 1,    step: 0.01 },
  { key: "spacing",  label: "Spacing",  min: 0.05, max: 2,    step: 0.05 },
];

const activeBrushSliders = computed(() =>
  BRUSH_SLIDERS.filter(bs => bs.key !== "hardness" || brush.brushType === "round"),
);

function brushDisplay(key: BrushSliderKey): string {
  const v = brush[key];
  if (key === "size") return `${Math.round(v)}px`;
  if (key === "spacing") return `${v.toFixed(2)}×`;
  return `${Math.round(v * 100)}%`;
}
</script>
