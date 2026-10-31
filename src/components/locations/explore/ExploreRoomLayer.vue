<template>
  <svg class="explore-room-layer" :width="hostW" :height="hostH" :viewBox="`0 0 ${hostW} ${hostH}`" aria-hidden="true">
    <!-- Rooms the party has not explored: shaded, but translucent, because the DM sees through (frame 09). -->
    <path :d="shadePathD" class="shade" />

    <!-- The room the party is about to enter. -->
    <line
      v-for="(e, i) in enteringEdges"
      :key="`enter-${i}`"
      :x1="e.x1"
      :y1="e.y1"
      :x2="e.x2"
      :y2="e.y2"
      class="entering"
      data-testid="explore-entering-outline"
    />

    <text v-for="label in labels" :key="label.id" :x="label.x" :y="label.y" class="room-name" text-anchor="middle">{{ label.name }}</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cellOutline, cellsCentre } from "@/lib/locations/explore";
import type { CellKey } from "@/types/dungeonMap.types";

/**
 * What exploring paints over the site's map for the DM: unexplored rooms shaded, the room being entered outlined in
 * gilt dashes, and every room's name where it sits. Cells are in battle-cell space, like the token layer's.
 */
const { cellPx, originX, originY, shaded, entering, rooms } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  /** Cells of every room still unexplored. */
  shaded: readonly CellKey[];
  /** Cells of the room the lead token is stepping into; empty when there is none. */
  entering: readonly CellKey[];
  rooms: readonly { id: string; name: string; cells: readonly CellKey[] }[];
}>();

const shadePathD = computed(() =>
  shaded
    .map((key) => {
      const [cx, cy] = key.split(",").map(Number);
      const x = originX + cx * cellPx;
      const y = originY + cy * cellPx;
      return `M${x},${y} H${x + cellPx} V${y + cellPx} H${x} Z`;
    })
    .join(" "),
);

const enteringEdges = computed(() =>
  cellOutline(entering).map((e) => ({
    x1: originX + e.x1 * cellPx,
    y1: originY + e.y1 * cellPx,
    x2: originX + e.x2 * cellPx,
    y2: originY + e.y2 * cellPx,
  })),
);

const labels = computed(() =>
  rooms.flatMap((room) => {
    const at = cellsCentre(room.cells);
    return at ? [{ id: room.id, name: room.name, x: originX + at.x * cellPx, y: originY + at.y * cellPx }] : [];
  }),
);
</script>

<style scoped>
.explore-room-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.shade {
  fill: rgb(10 8 6 / 0.5);
}

.entering {
  stroke: var(--color-primary);
  stroke-width: 2.5;
  stroke-dasharray: 8 5;
  stroke-linecap: round;
}

.room-name {
  fill: rgb(255 255 255 / 0.85);
  font-size: 12px;
  font-weight: 600;
  paint-order: stroke;
  stroke: rgb(10 8 6 / 0.7);
  stroke-width: 3px;
}
</style>
