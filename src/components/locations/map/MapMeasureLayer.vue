<template>
  <!-- The route (#932): a polyline through the waypoints and a numbered marker
       at each. Drawn in image fractions inside the frame's transformed slot, so
       it tracks pan and zoom like the pins do. Never takes a pointer event: a
       tap belongs to the frame, which hands it to `LocationMap`. -->
  <div v-if="points.length" class="pointer-events-none absolute inset-0 z-5">
    <!-- viewBox 0..1 so a point is its own fraction; the stretched box would
         distort a normal stroke, which `non-scaling-stroke` keeps at a fixed
         screen width regardless of both the stretch and the zoom. -->
    <svg class="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        :points="polylinePoints"
        fill="none"
        stroke="#0284c7"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <!-- Counter-scaled like the pins (see `MapPinsLayer.pinStyle`): the marker
         keeps its natural size however far the map is zoomed. -->
    <span
      v-for="(point, i) in points"
      :key="i"
      class="absolute flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-sky-600 text-label font-bold leading-none text-white shadow-md"
      :style="{
        left: `${point.x * 100}%`,
        top: `${point.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
      }"
    >
      {{ i + 1 }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ImagePoint } from "@/lib/locations/mapScale";

const { points, scale } = defineProps<{
  points: readonly ImagePoint[];
  /** The frame's current zoom, for counter-scaling the markers. */
  scale: number;
}>();

const polylinePoints = computed(() => points.map((p) => `${p.x},${p.y}`).join(" "));
</script>
