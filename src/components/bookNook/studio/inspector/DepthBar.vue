<template>
  <div class="flex flex-col gap-1" role="img" :aria-label="`${depthBand(depth)}, depth ${rounded}`">
    <div class="relative h-6">
      <span class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
      <span
        v-for="stop in STOPS"
        :key="stop.word"
        class="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border"
        :style="{ left: `${share(stop.depth)}%` }"
      />
      <span
        class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
        :style="{ left: `${share(depth)}%` }"
        data-testid="depth-knob"
      />
    </div>
    <div class="relative h-4 text-label uppercase text-muted-foreground" aria-hidden="true">
      <span v-for="stop in STOPS" :key="stop.word" class="absolute -translate-x-1/2" :style="{ left: `${share(stop.depth)}%` }">{{ stop.word }}</span>
    </div>
    <p class="text-caption tabular-nums text-muted-foreground">Depth {{ rounded }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { depthBand } from "@/lib/bookNook/edit";
import { DEPTH } from "@/lib/bookNook/presets";

/** Where a depth sits between Far and Near, with the Picture mark between: read-only, the side view sets it. */
const { depth } = defineProps<{ depth: number }>();

const STOPS = [
  { word: "Far", depth: DEPTH.far },
  { word: "Picture", depth: DEPTH.picture },
  { word: "Near", depth: DEPTH.near },
];
const share = (d: number) => ((Math.min(DEPTH.max, Math.max(DEPTH.min, d)) - DEPTH.min) / (DEPTH.max - DEPTH.min)) * 100;
const rounded = computed(() => Math.round(depth * 100) / 100);
</script>
