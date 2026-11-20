<template>
  <!-- The roads a map knows (#1222): a dashed straight line between two pins and its distance on a pill at the
       middle. Drawn in image fractions inside the frame's transformed slot, like the route, so it tracks pan and
       zoom. Never takes a pointer event: a tap belongs to the frame. -->
  <div v-if="lines.length" class="pointer-events-none absolute inset-0 z-4 text-foreground/70" data-testid="map-roads">
    <svg class="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <line
        v-for="line in lines"
        :key="line.roadId"
        :x1="line.from.x"
        :y1="line.from.y"
        :x2="line.to.x"
        :y2="line.to.y"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="6 5"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      v-for="line in lines"
      :key="line.roadId"
      class="absolute whitespace-nowrap rounded-full border border-border bg-card px-1.5 py-0.5 text-caption leading-none text-foreground shadow-sm"
      :style="{
        left: `${(line.from.x + (line.to.x - line.from.x) * line.labelAt) * 100}%`,
        top: `${(line.from.y + (line.to.y - line.from.y) * line.labelAt) * 100}%`,
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
      }"
    >
      {{ line.label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { MapRoadLine } from "@/lib/travel/mapRoads";

const { lines, scale } = defineProps<{
  lines: readonly MapRoadLine[];
  /** The frame's current zoom, for counter-scaling the labels. */
  scale: number;
}>();
</script>
