<template>
  <div class="border-t border-border">
    <div
      class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
      @click="emit('toggle')"
    >
      <IconChevronRight
        class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase text-foreground">
        Edge Treatment
      </span>
      <span
        v-if="EDGE_KEYS.some(e => opts[e].enabled)"
        class="text-label text-primary mr-2"
      >{{ EDGE_KEYS.filter(e => opts[e].enabled).length }} active</span>
    </div>

    <div v-show="open">
      <div
        v-for="edge in EDGE_KEYS"
        :key="edge"
        class="border-t border-border/50"
      >
        <div
          class="flex items-center pl-8 pr-4 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer select-none"
          @click="emit('toggle-edge', edge)"
        >
          <IconChevronRight
            class="h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform mr-2"
            :class="edgeOpen[edge] ? 'rotate-90' : ''"
          />
          <span
            class="flex-1 font-cinzel text-2xs font-semibold tracking-widest uppercase transition-colors"
            :class="opts[edge].enabled ? 'text-foreground' : 'text-muted-foreground'"
          >{{ edge }}</span>
          <ToggleSwitch
            :model-value="opts[edge].enabled"
            size="md"
            :aria-label="`${edge} edge treatment enabled`"
            @click.stop
            @update:model-value="(value) => emit('set-edge-enabled', edge, value)"
          />
        </div>

        <div
          v-show="edgeOpen[edge]"
          class="pl-8 pr-4 pb-4 flex flex-col gap-3 transition-opacity"
          :class="opts[edge].enabled ? 'opacity-100' : 'opacity-35'"
        >
          <div v-for="slider in SLIDERS" :key="slider.key">
            <div class="flex items-center justify-between mb-1">
              <label class="text-eyebrow text-muted-foreground">
                {{ slider.label }}
              </label>
              <span class="text-caption text-muted-foreground tabular-nums">
                {{ sliderDisplay(edge, slider.key) }}
              </span>
            </div>
            <input
              type="range"
              :min="slider.min"
              :max="slider.max"
              :step="slider.step"
              :value="opts[edge][slider.key]"
              class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
              @input="(e) => emit('set-slider', edge, slider.key, parseFloat((e.target as HTMLInputElement).value))"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronRight } from "@/lib/icons";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import type { EdgeTreatmentOptions } from "@/lib/illuminate/edgeTreatment";

const EDGE_KEYS = ["top", "right", "bottom", "left"] as const;
type EdgeKey = typeof EDGE_KEYS[number];
type SliderKey = "roughness" | "fadeWidth" | "tearDepth" | "passes" | "variation";

const {
  opts,
  open,
  edgeOpen,
} = defineProps<{
  opts: EdgeTreatmentOptions;
  open: boolean;
  edgeOpen: Record<string, boolean>;
}>();

const emit = defineEmits<{
  toggle: [];
  "toggle-edge": [edge: EdgeKey];
  "set-edge-enabled": [edge: EdgeKey, value: boolean];
  "set-slider": [edge: EdgeKey, key: SliderKey, value: number];
}>();

const SLIDERS: Array<{ key: SliderKey; label: string; min: number; max: number; step: number }> = [
  { key: "roughness",  label: "Roughness",  min: 0,  max: 1,  step: 0.01 },
  { key: "fadeWidth",  label: "Fade width", min: 0,  max: 1,  step: 0.01 },
  { key: "tearDepth",  label: "Tear depth", min: 0,  max: 1,  step: 0.01 },
  { key: "passes",     label: "Passes",     min: 1,  max: 12, step: 1    },
  { key: "variation",  label: "Variation",  min: 0,  max: 1,  step: 0.01 },
];

function sliderDisplay(edge: EdgeKey, key: SliderKey): string {
  const v = opts[edge][key];
  return key === "passes" ? String(Math.round(v)) : String(Math.round(v * 100));
}
</script>
