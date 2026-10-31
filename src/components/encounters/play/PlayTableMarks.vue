<template>
  <div class="table-marks" :style="{ width: hostW + 'px', height: hostH + 'px' }" data-testid="table-marks" aria-hidden="true">
    <svg :width="hostW" :height="hostH">
      <path
        v-for="d in drawings"
        :key="d.id"
        :d="pathOf(d.points)"
        :stroke="d.color"
        :stroke-width="d.width"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        data-testid="table-drawing"
      />
      <g v-for="m in measures" :key="m.id" data-testid="table-measure">
        <!-- A dark line under the white one so it reads on a pale map as well as a dark one. -->
        <path :d="pathOf(m.points)" class="measure-under" fill="none" />
        <path :d="pathOf(m.points)" class="measure-line" fill="none" />
        <circle v-for="(p, i) in m.points" :key="i" :cx="px(p[0])" :cy="py(p[1])" r="4.5" class="measure-end" />
      </g>
    </svg>

    <span
      v-for="m in labelled"
      :key="`l-${m.id}`"
      class="measure-label"
      :style="{ left: m.x + 'px', top: m.y + 'px' }"
      data-testid="table-measure-label"
    >{{ m.text }}</span>

    <span
      v-for="p in pings"
      :key="p.id"
      class="ping"
      :style="{ left: px(p.x) + 'px', top: py(p.y) + 'px', '--ping-ink': p.by.color }"
      data-testid="table-ping"
    >
      <span class="ring"></span>
      <span class="ring delay"></span>
      <span class="core"></span>
      <span class="who">{{ p.by.name }} pinged</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TableDrawing, TableMeasure, TablePing } from "@/composables/encounters/useTableChannel";
import { measureFeet } from "@/lib/battlemap/measure";
import type { Point } from "@/lib/tableChannel/messages";

/**
 * Everything the table has drawn on the map, in the map's own cells (#1125 decision 12): pings that ripple and say who,
 * measure lines with their length, drawings. The DM's map, the explore map and the player's map all mount this over
 * the same channel, so a mark looks the same on every screen. It only draws.
 */
const { cellPx, originX, originY, pings, measures, drawings } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  pings: readonly TablePing[];
  measures: readonly TableMeasure[];
  drawings: readonly TableDrawing[];
}>();

const px = (x: number) => originX + x * cellPx;
const py = (y: number) => originY + y * cellPx;
const pathOf = (points: readonly Point[]) => points.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0])},${py(p[1])}`).join(" ");

/** A line with only its first square has no length to read yet. */
const labelled = computed(() =>
  measures.flatMap((m) => {
    if (m.points.length < 2) return [];
    const end = m.points[m.points.length - 1];
    return [{ id: m.id, x: px(end[0]), y: py(end[1]) - 14, text: `${measureFeet(m.points)} ft` }];
  }),
);
</script>

<style scoped>
.table-marks {
  --gilt: #c9a227;
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.measure-under {
  stroke: rgb(0 0 0 / 0.55);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.measure-line {
  stroke: #fff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.measure-end {
  fill: #fff;
  stroke: rgb(0 0 0 / 0.55);
  stroke-width: 1.5;
}

/* Dark on light, as the frame draws it: it has to read over any map. */
.measure-label {
  position: absolute;
  transform: translate(-50%, -100%);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.94);
  color: #1c1917;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
}

.ping {
  position: absolute;
  width: 0;
  height: 0;
}

.ring {
  position: absolute;
  left: -1.5rem;
  top: -1.5rem;
  width: 3rem;
  height: 3rem;
  border: 2px solid var(--gilt);
  border-radius: 9999px;
  opacity: 0;
  animation: ping-ripple 1.25s ease-out 2 both;
}

.ring.delay {
  animation-delay: 0.3s;
}

.core {
  position: absolute;
  left: -0.3125rem;
  top: -0.3125rem;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  background: var(--gilt);
  box-shadow: 0 0 0 2px rgb(0 0 0 / 0.45);
}

.who {
  position: absolute;
  left: 0;
  top: 1.75rem;
  transform: translateX(-50%);
  padding: 0.0625rem 0.5rem;
  border: 1px solid var(--gilt);
  border-radius: 9999px;
  background: rgb(28 25 23 / 0.88);
  color: #f5e6b3;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

@keyframes ping-ripple {
  from {
    transform: scale(0.2);
    opacity: 0.95;
  }
  to {
    transform: scale(1.6);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ring {
    animation: none;
    opacity: 0.7;
    transform: none;
  }

  .ring.delay {
    display: none;
  }
}
</style>
